import logging
from typing import Any, Mapping, Optional

from django.db import transaction
from django.utils import timezone

from ai_hint.models import AIHintRequest, BackAIHintRequest


logger = logging.getLogger(__name__)


def _preview(val: Any, limit: int = 30) -> str:
    if val is None:
        return "None"
    s = val if isinstance(val, str) else repr(val)
    return (s[:limit] + f"...(len={len(s)})") if len(s) > limit else s


def create_ai_hint_request(
    student_id: str,
    problem_id: str,
    hint_type: str,
    student_program: str,
    student_notebook: Optional[Mapping] = None,
    other_input_data: Optional[Mapping] = None,
) -> AIHintRequest:
    """
    Add a new request to the database without any corresponding results.
    """
    obj = AIHintRequest.objects.create(
        student_id=student_id,
        problem_id=problem_id,
        hint_type=hint_type,
        student_program=student_program,
        student_notebook=student_notebook,
        other_input_data=other_input_data,
    )

    logger.info(
        f"ID: {obj.id} | Student ID: {obj.student_id} | Problem ID: {obj.problem_id} | "
        f"Hint Type: {obj.hint_type} | Student Program: {_preview(obj.student_program)} | "
        f"Student Notebook: {_preview(obj.student_notebook)} | "
        f"Other Input Data: {_preview(obj.other_input_data)}"
    )

    return obj


def load_ai_hint_request(request_id: int) -> AIHintRequest:
    try:
        return AIHintRequest.objects.get(id=request_id)
    except AIHintRequest.DoesNotExist:
        logger.error(f"AIHintRequest with id {request_id} does not exist")
        raise ValueError(f"AIHintRequest with id {request_id} does not exist")


def add_reflection_to_ai_request(
    request_id: int,
    reflection_question: str,
    reflection_answer: str,
) -> AIHintRequest:
    """
    Add reflection data to an existing AIHintRequest.
    """
    with transaction.atomic():
        req = AIHintRequest.objects.select_for_update().get(id=request_id)
        req.reflection_question = reflection_question
        req.reflection_answer = reflection_answer
        req.reflection_time = timezone.now()
        req.save(
            update_fields=[
                "reflection_question",
                "reflection_answer",
                "reflection_time",
            ]
        )
    logger.info(f"Reflection saved (request={request_id})")
    return req


def add_back_ai_hint_request(
    request_id: int,
    result_returned: bool,
) -> BackAIHintRequest:
    # Add the back-request to the database
    obj = BackAIHintRequest.objects.create(
        original_request_id=request_id,
        result_returned=result_returned,
    )
    logger.info(f"BackAIHintRequest created id={obj.id} original={request_id}")
    return obj


def save_hint_results(
    request_id: int,
    job_finished_successfully: bool,
    generation_error_message: Optional[str],
    hint: str,
    other_hint_data: Optional[Mapping],
) -> AIHintRequest:
    with transaction.atomic():
        req = AIHintRequest.objects.select_for_update().get(id=request_id)
        req.job_finished_successfully = job_finished_successfully
        req.generation_error_message = generation_error_message
        req.returned_hint = hint
        req.returned_time = timezone.now()
        req.other_hint_data = other_hint_data
        req.save(
            update_fields=[
                "job_finished_successfully",
                "generation_error_message",
                "returned_hint",
                "returned_time",
                "other_hint_data",
            ]
        )
    logger.info(
        f"Hint result saved (request={request_id} success={job_finished_successfully})"
    )
    return req


def load_all_ai_hints(student_id: int, problem_id: int) -> list[dict]:
    """
    Load all AIHintRequests for a specific student and problem.
    Return a list of dictionaries containing:
        - request_id
        - hint_type
        - job_finished_successfully
        - returned_hint
        - is_hint_helpful
        - created_at (ISO string)
        - returned_time (ISO string or null)
    """
    try:
        qs = (
            AIHintRequest.objects
            .filter(student_id=student_id, problem_id=problem_id, is_cancelled=False)
            .exclude(job_finished_successfully__isnull=True)
            .order_by("id")
        )
        results: list[dict] = []
        for obj in qs:
            try:
                created = obj.created_at.isoformat() if obj.created_at else None
            except Exception:
                created = None
            try:
                returned = obj.returned_time.isoformat() if obj.returned_time else None
            except Exception:
                returned = None
            results.append({
                "id": obj.id,
                "request_id": obj.id,
                "hint_type": obj.hint_type,
                "job_finished_successfully": obj.job_finished_successfully,
                "returned_hint": obj.returned_hint,
                "is_hint_helpful": obj.is_hint_helpful,
                "created_at": created,
                "returned_time": returned,
            })
        return results
    except Exception as e:
        logger.error(f"Error loading all AI hints: {e}")
        raise
