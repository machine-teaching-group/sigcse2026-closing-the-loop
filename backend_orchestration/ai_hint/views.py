import json
import logging
import os

from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
import requests
from django.db import transaction



from ai_hint.utils.db_utils import add_back_ai_hint_request, create_ai_hint_request, add_reflection_to_ai_request, load_ai_hint_request, load_all_ai_hints, save_hint_results
from ai_hint.utils.request_utils import extract_request
from ai_hint.utils.quota_utils import QuotaExceededError, compute_quota_left, enforce_hint_quota, query_used_hints
from ai_hint.models import AIHintRequest
from user_customizable_configs.quota.loader import get_hint_quota


logger = logging.getLogger(__name__)


@csrf_exempt
def add_request(request):
    """
    Receive request for AI hint.
    1. Verify request method is POST.
    2. Validate and extract request data.
    3. Enforce quota before adding a new request.
    4. Add request to the database.
    5. Post the request to backend_hint.
    """
    # Verify request method
    if request.method != "POST":
        return HttpResponse(status=405)

    # Extract parameters: get request data
    try:
        (
            student_id,
            problem_id,
            student_program,
            student_notebook,
            hint_type,
            other_data,
        ) = extract_request(request)
    except Exception as e:
        logger.error(f"Error extracting request: {e}")
        return HttpResponse(f"Error extracting request: {e}", status=400)

    logger.info(f"Received add_request:\n- student_id: {student_id}\n- problem_id: {problem_id}\n- hint_type: {hint_type}\n- program:\n{student_program}")

    # Enforce quota and add request within a single transaction to avoid races
    try:
        with transaction.atomic():
            # Enforce quota
            enforce_hint_quota(student_id=student_id, problem_id=problem_id, hint_type=hint_type)

            # Passed quota checks: create the request row within the lock
            hint_request = create_ai_hint_request(
                student_id=student_id,
                problem_id=problem_id,
                hint_type=hint_type,
                student_program=student_program,
                student_notebook=student_notebook,
                other_input_data=other_data,
            )
    except QuotaExceededError as e:
        return HttpResponse(f"Quota exceeded: {e}", status=429)
    except Exception as e:
        logger.error(f"Error enforcing quota or adding request to database: {e}")
        return HttpResponse(f"Error enforcing quota or adding request to the database: {e}", status=500)

    # Post the request to backend_hint
    try:
        response = requests.post(
            # headers={"Host": "backend-hint", "Content-Type": "application/json"},
            url=os.environ["BACKEND_HINT_ADD_REQUEST_URL"],  #TODO
            json={
                "request_id": hint_request.id,
                "type": "add_request",
                "data": {
                    "problem_id": problem_id,
                    "student_program": student_program,
                    "hint_type": hint_type,
                },
            },
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Error posting request to the backend hint server: {e}")
        return HttpResponse(f"Error posting request to the backend hint server: {e}", status=500)

    # Return the request id for the client to query later
    logger.info(f"[x] Adding request: Return request_id {hint_request.id}")
    return HttpResponse(json.dumps({"request_id": hint_request.id}))


@csrf_exempt
def add_reflection(request):
    """
    Receive student's reflection to add to a hint request.
    1. Validate request method is POST.
    2. Extract request data.
    3. Add reflection to the database.
    4. Post reflection to the backend_hint.
    """
    # Validate request method
    if request.method != "POST":
        return HttpResponse(status=405)

    # Extract request data
    try:
        payload = json.loads(request.body)
        request_id = int(payload["request_id"])
        reflection_question = payload["reflection_question"]
        reflection_answer = payload["reflection_answer"]
    except Exception as e:
        logger.error(f"Error extracting reflection request: {e}")
        return HttpResponse(f"Error extracting reflection request: {e}", status=400)

    # Add reflection to the database
    try:
        add_reflection_to_ai_request(
            request_id=request_id,
            reflection_question=reflection_question,
            reflection_answer=reflection_answer,
        )
    except Exception as e:
        logger.error(f"Error adding reflection to database: {e}")
        return HttpResponse(f"Error adding reflection to the database: {e}", status=500)

    # Post reflection to the backend_hint
    try:
        response = requests.post(
            url=os.environ["BACKEND_HINT_ADD_REFLECTION_URL"],
            json={
                "request_id": request_id,
                "type": "add_reflection",
                "data": {
                    "reflection_question": reflection_question,
                    "reflection_answer": reflection_answer,
                },
            },
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Error posting reflection to backend_hint: {e}")
        return HttpResponse(f"Error posting reflection to backend_hint: {e}", status=500)

    # Return the request id for the client to query later
    logger.info(f"[x] Adding reflection: Return request_id {request_id}")
    return HttpResponse(json.dumps({"request_id": request_id}))


def query_hint(request):
    """
    Query the status of a hint request.
    1. Validate request method is GET.
    2. Extract request parameters.
    3. Query the database for the hint request.
    4. Log the back-request and response.
    5. Return the status of the hint request.
    """
    # Validate request method
    if request.method != "GET":
        return HttpResponse(status=405)
    
    # Extract request data
    try:
        request_id = int(request.GET["request_id"])
    except Exception as e:
        logger.error(f"Error extracting request_id: {e}")
        return HttpResponse(f"Error extracting request_id: {e}", status=400)

    # Query the database for the hint request    
    try:
        hint_request = load_ai_hint_request(request_id=request_id)
    except Exception as e:
        logger.error(f"Request {request_id} not found: {e}")
        return HttpResponse(f"Request {request_id} not found: {e}", status=404)

    if hint_request.job_finished_successfully:
        # job is finished successfully, return the hint
        job_finished = True
        successful = True
        returned_hint = hint_request.returned_hint
    elif hint_request.job_finished_successfully is None:
        # job is not finished yet
        job_finished = False
        successful = True
        returned_hint = None
    else:  # job_finished_successfully is False
        job_finished = True
        successful = False
        returned_hint = hint_request.returned_hint
    
    # Save the back-request to database
    try:
        add_back_ai_hint_request(
            request_id=request_id,
            result_returned=job_finished,
        )
    except Exception as e:
        logger.error(f"Error saving back-request: {e}")
        return HttpResponse(f"Error saving back-request: {e}", status=500)

    # Return the status of the hint request
    if successful is not False:
        json_str_return = json.dumps({
            "request_id": request_id,
            "job_finished": job_finished,
            "hint": returned_hint,
        })
        logger.info(f"[x] Return hint {json_str_return}")
        return HttpResponse(json_str_return)
    else:
        logger.error(f"[x] Return 500 error for request_id {request_id}")
        return HttpResponse(status=500)


def query_all_hint(request):
    """
    Query all hints for a specific student and problem.
    """
    # Validate request method
    if request.method != "GET":
        return HttpResponse(status=405)

    # Extract request parameters
    try:
        student_id = request.GET["student_id"]
        problem_id = request.GET["problem_id"]
    except Exception as e:
        logger.error(f"Error extracting parameters for query_all_hint: {e}")
        return HttpResponse(f"Error extracting parameters for query_all_hint: {e}", status=400)

    # Query the database for all hints
    try:
        hints = load_all_ai_hints(student_id=student_id, problem_id=problem_id)
    except Exception as e:
        logger.error(f"Error querying all hints: {e}")
        return HttpResponse(f"Error querying all hints: {e}", status=500)

    # Return the hints
    logger.info(f"[x] Return all hints for student {student_id} and problem {problem_id}: {len(hints)} hints")
    return HttpResponse(json.dumps(hints), content_type="application/json")


@csrf_exempt
def save_hint(request):
    """
    Receive and save a hint.
    1. Validate request method is POST.
    2. Extract request parameters.
    3. Save the hint to the database.
    4. Return a success response.
    """
    # Validate request method
    if request.method != "POST":
        return HttpResponse(status=405)

    # Extract request parameters
    try:
        data = json.loads(request.body)
        request_id = int(data["request_id"])
        job_finished_successfully = data["job_finished_successfully"]
        generation_error_message = data.get("generation_error_message", None)
        hint = data["hint"]
        other_hint_data = data.get("other_hint_data", None)
    except Exception as e:
        logger.error(f"Error extracting data for save_hint: {e}")
        return HttpResponse(f"Error extracting data for save_hint: {e}", status=400)

    # Save the hint to the database
    try:
        save_hint_results(
            request_id=request_id,
            job_finished_successfully=job_finished_successfully,
            generation_error_message=generation_error_message,
            hint=hint,
            other_hint_data=other_hint_data
        )
    except Exception as e:
        logger.error(f"Error saving hint to database: {e}")
        return HttpResponse(f"Error saving hint to database: {e}", status=500)

    # Return a success response
    logger.info(f"[x] Successfully saved hint for request_id {request_id}")
    return HttpResponse(status=204)


@csrf_exempt
def save_hint_rating(request):
    """
    Receive and save a hint rating.
    1. Validate request method is POST.
    2. Extract request parameters.
    3. Save the hint rating to the database.
    4. Return a success response.
    """
    # Validate request method
    if request.method != "POST":
        return HttpResponse(status=405)

    # Extract request parameters
    try:
        data = json.loads(request.body)
        request_id = int(data["request_id"])
        is_hint_helpful = data["is_hint_helpful"]
    except Exception as e:
        logger.error(f"Error extracting data for save_hint_rating: {e}")
        return HttpResponse(f"Error extracting data for save_hint_rating: {e}", status=400)

    # Save the hint rating to the database
    try:
        hint_request = load_ai_hint_request(request_id=request_id)
        hint_request.is_hint_helpful = is_hint_helpful
        hint_request.hint_rated_time = timezone.now()
        hint_request.save()
    except Exception as e:
        logger.error(f"Error saving hint rating to database: {e}")
        return HttpResponse(f"Error saving hint rating to database: {e}", status=500)

    # Return a success response
    logger.info(f"[x] Successfully saved hint rating for request_id {request_id}")
    return HttpResponse(status=204)


def quota_left(request):
    """
    Return remaining quota for a student/problem: overall and per hint type.
    Response shape:
      {
        "student_id": str,
        "problem_id": str,
        "left": { "overall": int|null, "plan": int|null, "debug": int|null, "optimize": int|null },
        "limits": { ... },
        "used": { ... }
      }
    Note: null means unlimited.
    """
    if request.method != "GET":
        return HttpResponse(status=405)

    try:
        student_id = request.GET["student_id"]
        problem_id = request.GET["problem_id"]
    except Exception as e:
        logger.error(f"quota_left: missing params: {e}")
        return HttpResponse("Missing student_id or problem_id", status=400)

    try:
        quota = get_hint_quota()
        limits = {
            "overall": quota.max_hints_per_problem,
            "plan": quota.max_planning_hints_per_problem,
            "debug": quota.max_debugging_hints_per_problem,
            "optimize": quota.max_optimization_hints_per_problem,
        }
    
        used = query_used_hints(student_id, problem_id)

        quota_left = compute_quota_left(
            limits={
                "overall": quota.max_hints_per_problem,
                "plan": quota.max_planning_hints_per_problem,
                "debug": quota.max_debugging_hints_per_problem,
                "optimize": quota.max_optimization_hints_per_problem,
            },
            used=used,
        )

        payload = {
            "student_id": student_id,
            "problem_id": problem_id,
            "limits": limits,
            "used": used,
            "left": quota_left,
        }
        return HttpResponse(json.dumps(payload), content_type="application/json")
    except Exception as e:
        logger.error(f"quota_left: error computing quota: {e}")
        return HttpResponse("Failed to compute quota", status=500)


def has_ever_requested(request):
    """
    Return whether a student (student_id) has ever requested any AI hint before.
    Query params: student_id
    Response: { "student_id": str, "ever_requested": bool }
    """
    if request.method != "GET":
        return HttpResponse(status=405)

    try:
        student_id = request.GET["student_id"]
    except Exception as e:
        logger.error(f"has_ever_requested: missing student_id: {e}")
        return HttpResponse("Missing student_id", status=400)

    try:
        exists = AIHintRequest.objects.filter(student_id=student_id).exists()
        payload = {"student_id": student_id, "ever_requested": bool(exists)}
        logger.info(f"[x] has_ever_requested for {student_id}: {exists}")
        return HttpResponse(json.dumps(payload), content_type="application/json")
    except Exception as e:
        logger.error(f"has_ever_requested: error querying database: {e}")
        return HttpResponse("Failed to check hint history", status=500)


@csrf_exempt
def cancel_request(request):
    """
    Mark an AI hint request as cancelled by the student.
    Request: POST { request_id: int }
    Response: 204 on success
    """
    if request.method != "POST":
        return HttpResponse(status=405)

    try:
        data = json.loads(request.body)
        request_id = int(data["request_id"])
    except Exception as e:
        logger.error(f"cancel_request: invalid payload: {e}")
        return HttpResponse("Invalid payload", status=400)

    try:
        obj = load_ai_hint_request(request_id=request_id)
    except Exception as e:
        logger.error(f"cancel_request: request {request_id} not found: {e}")
        return HttpResponse("Request not found", status=404)

    try:
        if not obj.is_cancelled:
            obj.is_cancelled = True
            obj.save(update_fields=["is_cancelled"]) 
            logger.info(f"[x] cancel_request: marked request {request_id} as cancelled")
        else:
            logger.info(f"[x] cancel_request: request {request_id} already cancelled (idempotent)")
        return HttpResponse(status=204)
    except Exception as e:
        logger.error(f"cancel_request: failed to update {request_id}: {e}")
        return HttpResponse("Failed to cancel request", status=500)


    