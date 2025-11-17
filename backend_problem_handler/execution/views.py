import json
import logging
import os
from typing import Any, Dict

from django.http import JsonResponse, HttpRequest, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from user_customizable_configs.programming_tasks.task_loader import get_task
from execution.utils.queue_utils import publish_task

from .models import ProgramExecution

logger = logging.getLogger(__name__)



@csrf_exempt
def execute_program(request: HttpRequest) -> HttpResponse:
    """
    POST /execute_program/
    JSON body:
      {
        "problem_id": "<id>",
        "student_program": "<python source>"
      }

    Returns:
        {
            "execution_id": "<id>",
        }
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    # Parse JSON
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        logger.exception("Failed to parse JSON body")
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    problem_id = payload.get("problem_id")
    student_program = payload.get("student_program")

    if not problem_id:
        logger.warning("Missing field: problem_id")
        return JsonResponse({"error": "Missing field: problem_id"}, status=400)
    if not isinstance(student_program, str):
        logger.warning("Missing field: student_program")
        return JsonResponse({"error": "Missing field: student_program"}, status=400)

    # Create execution record
    exec_rec = ProgramExecution.objects.create(
        problem_id=problem_id,
    )
    logger.info(
        f"Added execution record id={exec_rec.pk} for problem_id={problem_id}",
    )

    # Queue this task for async processing
    try:
        publish_task(
            type="execute_program",
            tries=1,
            data={
                "problem_id": problem_id,
                "student_program": student_program,
                "execution_id": exec_rec.pk,
            },
            priority=int(os.environ["EXECUTE_PROGRAM_PRIORITY"]),
        )
    except Exception as e:
        logger.exception(f"Failed to publish task for executing program_id={problem_id}: {e}")
        exec_rec.is_success = False
        exec_rec.error = f"Failed to enqueue execution task: {e}"
        exec_rec.save(update_fields=["is_success", "error", "updated_at"])
        return JsonResponse({"error": "Failed to enqueue execution task"}, status=500)
    
    resp: Dict[str, Any] = {
        "execution_id": exec_rec.pk,
    }
    return JsonResponse(resp, status=200)


def get_execution_result(request: HttpRequest) -> HttpResponse:
    """
    Handle polling for execution result:
      /get_execution_result/?execution_id=<id>
      
    Returns:
        {
            "job_finished": <bool>
            "execution_id": "<id>",
            "correctness": <bool>,
            "buggy_output": "<str>",
            "elapsed_time": <float>,
        }
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    execution_id = request.GET.get("execution_id")
    if not execution_id:
        logger.warning("Missing field: execution_id")
        return JsonResponse({"error": "Missing field: execution_id"}, status=400)
    try:
        execution_id = int(execution_id)
    except ValueError:
        logger.warning(f"Invalid execution_id: {execution_id}")
        return JsonResponse({"error": "Invalid execution_id"}, status=400)

    # Fetch record
    try:
        exec_rec = ProgramExecution.objects.get(pk=execution_id)
    except ProgramExecution.DoesNotExist:
        logger.info(f"Execution result requested for unknown execution_id={execution_id}")
        return JsonResponse({"error": "Execution record not found", "execution_id": execution_id}, status=404)

    if exec_rec.is_success is None:
        # Still pending (probably), or terminated unexpectedly without setting is_success
        # Load problem config and check if time exceeded 10 times the expected time limit, if so mark as failed
        exec_rec = ProgramExecution.objects.get(pk=execution_id)
        try:
            task = get_task(exec_rec.problem_id, strict_files=True)
        except Exception as e:
            logger.info(f"Failed to load task config for problem_id={exec_rec.problem_id}: {e}")
            return JsonResponse({"error": "Failed to load task config", "execution_id": execution_id}, status=500)
        waited_time = (timezone.now() - exec_rec.created_at).total_seconds()
        if waited_time > 10 * task.timeout:
            return JsonResponse({"error": "Execution took too long (more than 10 times the expected time limit), possibly due to worker failure", "execution_id": execution_id}, status=500)
        # Still pending
        return JsonResponse({"job_finished": False, "execution_id": execution_id}, status=200)
    
    if exec_rec.is_success is False:
        # Failed execution
        resp: Dict[str, Any] = {
            "job_finished": True,
            "execution_id": execution_id,
            "error": exec_rec.error or "Execution failed",
        }
        return JsonResponse(resp, status=200)

    # Finished successfully
    resp: Dict[str, Any] = {
        "job_finished": True,
        "execution_id": execution_id,
        "correctness": exec_rec.correctness,
        "buggy_output": exec_rec.output,
        "elapsed_time": round(exec_rec.elapsed_time, 6) if exec_rec.elapsed_time is not None else None,
    }
    return JsonResponse(resp, status=200)