import json
import logging
import os
import requests

from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt

from ai_hint.utils.db_utils import add_request as add_request_db
from ai_hint.utils.queue_utils import publish_task

logger = logging.getLogger(__name__)

@csrf_exempt
def add_request(request):
    """
    Receive a new hint request.
    1. Validate request method is POST.
    2. Extract request data.
    3. Add request data to the database.
    4. Publish task to the queue.
    5. Return response.
    """
    # Validate request method
    if request.method != "POST":
        return HttpResponse(status=405)

    # Extract request data
    try:
        payload = json.loads(request.body)
        logger.info(f"Received add_request: {str(payload)[:120]}...")

        request_id = payload["request_id"]
        args = payload['data']
        problem_id = args['problem_id']
        hint_type = args['hint_type']
        student_program = args['student_program']
        student_notebook = args.get('student_notebook', None)
    except Exception as e:
        logger.error(f"Error extracting data for add_request: {e}")
        return JsonResponse(f"Error extracting data for add_request: {e}", status=400)

    # Add request data to the database
    try:
        add_request_db(
            request_id=request_id,
            problem_id=problem_id,
            hint_type=hint_type,
            student_program=student_program,
            student_notebook=student_notebook,
        )
    except Exception as e:
        logger.error(f"Error adding data for add_request: {e}")
        return JsonResponse(f"Error adding data for add_request: {e}", status=500)

    # Publish 2 tasks to queue: run student program and query for enhanced programs
    try:
        publish_task(
            type="run_student_buggy_program",
            tries=1,
            data={"request_id": request_id},
            priority=int(os.environ["RUN_STUDENT_PROGRAM_PRIORITY"]),
        )
    except Exception as e:
        logger.error(f"Error publishing run_student_buggy_program task: {e}")
        return JsonResponse(f"Error publishing task to queue: {e}", status=500)

    try:
        publish_task(
            type="query_for_enhanced_programs",
            tries=1,
            data={"request_id": request_id},
            priority=int(os.environ["QUERY_FOR_ENHANCED_PROGRAMS_PRIORITY"]),
        )
    except Exception as e:
        logger.error(f"Error publishing query_for_enhanced_programs task: {e}")
        return JsonResponse(f"Error publishing task to queue: {e}", status=500)

    # Return response
    logger.info(f" [*] Successfully added request {request_id}")
    return HttpResponse(status=200)


@csrf_exempt
def add_reflection(request):
    """
    Receive student's reflection to add to a hint request.
    1. Validate request method is POST.
    2. Extract request data.
    3. Publish task to the queue
    5. Return response.
    """
    # Validate request method
    if request.method != "POST":
        return HttpResponse(status=405)

    # Extract request data
    try:
        payload = json.loads(request.body)
        logger.info(f"Received add_reflection: {payload}")
        
        request_id = payload["request_id"]
        args = payload['data']
        reflection_question = args['reflection_question']
        reflection_answer = args['reflection_answer']
    except Exception as e:
        logger.error(f"Error extracting reflection data: {e}")
        return JsonResponse(f"Error extracting reflection data: {e}", status=400)

    try:
        publish_task(
            type="add_reflection",
            tries=1,
            data={"request_id": request_id, "reflection_question": reflection_question, "reflection_answer": reflection_answer},
            priority=int(os.environ["ADD_REFLECTION_PRIORITY"]),
        )
    except Exception as e:
        logger.error(f"Error publishing add_reflection task: {e}")
        return JsonResponse(f"Error publishing task to queue: {e}", status=500)

    # Return response
    logger.info(f" [*] Successfully added reflection for request {request_id}")
    return HttpResponse(status=200)


