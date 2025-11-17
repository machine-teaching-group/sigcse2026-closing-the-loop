import logging
from typing import Any, Dict, List

from django.http import JsonResponse, HttpRequest, HttpResponse

logger = logging.getLogger(__name__)

from user_customizable_configs.programming_tasks.task_loader import (
    get_task_metadata,
    get_task,
)


def _serialize_task_basic(task, include_description: bool) -> Dict[str, Any]:
    data = {"problem_id": task.problem_id, "name": getattr(task, "name", None) or task.problem_id}
    if include_description:
        try:
            data["task_description"] = task.description_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            data["task_description_error"] = (
                f"Description file missing: {task.description_path}"
            )
        except OSError as e:
            data["task_description_error"] = f"Error reading description: {e}"
        
        try:
            data["template_code"] = task.template_code_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            data["template_code_error"] = (
                f"Template code file missing: {task.template_code_path}"
            )
        except OSError as e:
            data["template_code_error"] = f"Error reading template code: {e}"
    return data


def query_programming_problems(request: HttpRequest) -> HttpResponse:
    """
    GET /query_programming_problems
      Optional query params:
        problem_id=<id>            Return a single problem.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    problem_id = request.GET.get("problem_id")

    # Single problem path
    if problem_id:
        try:
            task = get_task(problem_id)
        except KeyError:
            logger.info(f"Problem not found: {problem_id}")
            return JsonResponse(
                {"error": "Problem not found", "problem_id": problem_id}, status=404
            )
        data = _serialize_task_basic(task, include_description=True)
        logger.info(f"Returning single programming problem: {problem_id}")
        return JsonResponse(data, status=200)

    # Listing path
    try:
        tasks = get_task_metadata()
    except Exception as e:
        logger.exception("Failed loading task metadata")
        return JsonResponse(
            {"error": "Failed to load tasks", "detail": str(e)}, status=500
        )

    listing: List[Dict[str, Any]] = [_serialize_task_basic(t, False) for t in tasks]
    logger.info(f"Returning {len(listing)} programming problems")
    return JsonResponse(listing, safe=False, status=200)
