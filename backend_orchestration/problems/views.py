import os
import json
import logging
from typing import Any, Dict

import requests
from django.http import JsonResponse, HttpRequest, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction

from problems.utils import request_problems

from .models import ProgramExecution

logger = logging.getLogger(__name__)


def _get_required_url(var_name: str) -> str:
    url = os.getenv(var_name)
    if not url:
        raise RuntimeError(f"Environment variable {var_name} not configured")
    return url


def query_programming_problems(request: HttpRequest) -> HttpResponse:
    """
    Proxy GET to problem handler:
      /programming_problems/?problem_id=<id>
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    # Pass through all query parameters
    params = request.GET.dict()
    logger.info(f"query_programming_problems with params: {params}")

    json_response, status_code = request_problems(params)
    return JsonResponse(
        json_response,
        safe=not isinstance(json_response, list),
        status=status_code
    )


@csrf_exempt
def execute_program(request: HttpRequest) -> HttpResponse:
    """
    Proxy POST to problem handler:
      Body: { "problem_id": "...", "student_program": "..." }
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        base_url = _get_required_url("BACKEND_PROBLEM_HANDLER_EXECUTE_CODE_URL")
    except RuntimeError as e:
        logger.error(f"execute_program configuration error: {e}")
        return JsonResponse({"error": str(e)}, status=500)

    # Parse incoming JSON
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        logger.error("Invalid JSON body in execute_program")
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    problem_id = payload.get("problem_id")
    student_program = payload.get("student_program")
    student_id = payload.get("student_id") or None

    if not problem_id:
        logger.error(f"Missing field: problem_id")
        return JsonResponse({"error": "Missing field: problem_id"}, status=400)
    if not isinstance(student_program, str):
        logger.error(f"Missing or empty field: student_program")
        return JsonResponse({"error": "Missing field: student_program"}, status=400)

    # Call execution backend
    try:
        resp = requests.post(base_url, json={"problem_id": problem_id, "student_program": student_program})
    except Exception as e:
        logger.error(f"Upstream network error for problem_id={problem_id}: {e}")
        return JsonResponse({"error": "Upstream network error", "detail": str(e)}, status=502)
    
    if resp.status_code != 200:  # Pass through upstream error
        return JsonResponse(
            {"error": f"Upstream returned status {resp.status_code}", "body": resp.text[:500]},
            status=resp.status_code,
        )
    
    try:
        data = resp.json()
        execution_id = data.get("execution_id")
    except ValueError:
        logger.error(f"Upstream returned non-JSON for problem_id={problem_id}: status={resp.status_code}")
        return JsonResponse(
            {
                "error": "Upstream returned non-JSON",
                "status_code": resp.status_code,
                "body": resp.text[:500],
            },
            status=502 if resp.status_code == 200 else resp.status_code,
        )
    except KeyError:
        logger.error(f"Upstream response missing execution_id for problem_id={problem_id}: {data}")
        return JsonResponse(
            {
                "error": "Upstream response missing execution_id",
                "body": data,
            },
            status=502,
        )
    except Exception as e:
        logger.error(f"Unexpected error proxying execute_program problem_id={problem_id}: {e}")
        return JsonResponse({"error": "Unexpected error", "detail": str(e)}, status=500)

    # Create DB record after receiving execution_id
    with transaction.atomic():
        ProgramExecution.objects.create(
            student_id=student_id,
            problem_id=problem_id,
            program=student_program,
            execution_id=execution_id,
        )

    # Forward upstream response
    logger.info(f"execute_program completed posting program problem_id={problem_id} status={resp.status_code} execution_id={execution_id}")
    return JsonResponse(data, status=resp.status_code)


def get_execution_result(request: HttpRequest) -> HttpResponse:
    """
    Handle polling for execution result from problem handler:
      /get_execution_result/?execution_id=<id>
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        base_url = _get_required_url("BACKEND_PROBLEM_HANDLER_GET_EXECUTION_RESULT_URL")
    except RuntimeError as e:
        logger.error(f"get_execution_result configuration error: {e}")
        return JsonResponse({"error": str(e)}, status=500)

    execution_id = request.GET.get("execution_id")
    if not execution_id:
        logger.error("Missing query parameter: execution_id")
        return JsonResponse({"error": "Missing query parameter: execution_id"}, status=400)

    try:
        resp = requests.get(base_url, params={"execution_id": execution_id})
    except Exception as e:
        logger.error(f"Upstream network error for execution_id={execution_id}: {e}")
        # Update record with failure info (no correctness) and return error
        try:
            with transaction.atomic():
                exec_rec = ProgramExecution.objects.select_for_update().get(execution_id=execution_id)
                exec_rec.output = f"Upstream network error: {e}"
                exec_rec.is_success = False
                exec_rec.error_message = str(e)
                exec_rec.save(update_fields=["output", "is_success", "error_message", "updated_at"])
        except Exception:
            logger.exception("Failed to update ProgramExecution after network error")
        return JsonResponse(
            {"error": "Upstream network error", "detail": str(e)},
            status=502,
        )

    # Forward upstream response
    try:
        data: Dict[str, Any] = resp.json()
    except ValueError:
        logger.error(f"Upstream returned non-JSON for execution_id={execution_id}: status={resp.status_code}")
        # Update record with failure info (no correctness) and return error
        try:
            with transaction.atomic():
                exec_rec = ProgramExecution.objects.select_for_update().get(execution_id=execution_id)
                exec_rec.output = f"Upstream returned non-JSON: {resp.text[:500]}"
                exec_rec.is_success = False
                exec_rec.error_message = "Upstream returned non-JSON"
                exec_rec.save(update_fields=["output", "is_success", "error_message", "updated_at"])
        except Exception:
            logger.exception("Failed to update ProgramExecution after non-JSON error")
        return JsonResponse(
            {
                "error": "Upstream returned non-JSON",
                "status_code": resp.status_code,
                "body": resp.text[:500],
                "execution_id": execution_id,
            },
            status=502 if resp.status_code == 200 else resp.status_code,
        )
    
    if data.get("job_finished", False):
        # Update DB record with execution results when finished
        try:
            with transaction.atomic():
                exec_rec = ProgramExecution.objects.select_for_update().get(execution_id=execution_id)
                exec_rec.is_success = True
                exec_rec.correctness = bool(data.get("correctness")) if "correctness" in data else None
                exec_rec.output = data.get("buggy_output")
                # Allow elapsed_time missing or non-numeric
                elapsed = data.get("elapsed_time")
                try:
                    exec_rec.elapsed_time = float(elapsed) if elapsed is not None else None
                except (TypeError, ValueError):
                    exec_rec.elapsed_time = None
                exec_rec.save(update_fields=["correctness", "output", "elapsed_time", "is_success"])
                logger.info(f"ProgramExecution updated with results id={exec_rec.id} execution_id={execution_id} success={exec_rec.is_success}")
        except Exception:
            logger.exception("Failed to update ProgramExecution with results execution_id=%s", execution_id)

    logger.info(f"get_execution_result completed execution_id={execution_id} status={resp.status_code}")
    return JsonResponse(data, status=resp.status_code)