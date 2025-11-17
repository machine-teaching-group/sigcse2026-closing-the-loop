from typing import Optional, Tuple
import logging
from datetime import timedelta
from django.utils import timezone
from django.db import models, transaction

from problems.utils import request_problems
from instructor_feedback.models import InstructorFeedback
from ai_hint.models import AIHintRequest

logger = logging.getLogger(__name__)


def add_instructor_feedback_request(
    request_id: str,
    student_email: Optional[str] = None,
    student_notes: Optional[str] = None,
) -> None:
    """
    Add a new instructor feedback request to the database.
    """
    try:
        feedback = InstructorFeedback.objects.create(
            ai_hint_request_id=request_id,
            student_email=student_email,
            student_notes=student_notes,
        )
        logger.info(f"Created feedback request: {feedback.id} for AIHintRequest {request_id}")
    except Exception as e:
        logger.error(f"Error creating feedback request: {e}")
        raise


def load_instructor_feedback_request(instructor_request_id: int) -> Tuple[InstructorFeedback, AIHintRequest] | None:
    """
    Load an instructor feedback request by its ID.
    Return None if not found.
    """
    try:
        instructor_req = InstructorFeedback.objects.select_related("ai_hint_request").get(id=instructor_request_id)
        ai_req = instructor_req.ai_hint_request
        return instructor_req, ai_req
    except InstructorFeedback.DoesNotExist:
        return None


def get_all_instructor_feedback_requests(student_id: int, problem_id: str) -> list[dict]:
    """
    Load all instructor feedback requests for a specific student and problem.
    Return a list of dictionaries containing:
        - instructor_request_id
        - ai_hint_request_id
        - instructor_feedback
        - is_feedback_helpful
        - created_at (ISO string)
    """
    try:
        feedback_requests = InstructorFeedback.objects.filter(
            ai_hint_request__student_id=student_id,
            ai_hint_request__problem_id=problem_id,
            request_fulfilled=True
        )
        results: list[dict] = []
        for feedback in feedback_requests:
            try:
                created = feedback.created_at.isoformat() if feedback.created_at else None
            except Exception:
                created = None
            results.append({
                "instructor_request_id": feedback.id,
                "ai_hint_request_id": feedback.ai_hint_request.id,
                "instructor_feedback": feedback.instructor_feedback,
                "is_feedback_helpful": feedback.is_feedback_helpful,
                "created_at": created,
            })
        return results
    except Exception as e:
        logger.error(f"Error fetching all instructor feedback requests: {e}")
        raise


def get_instructor_feedback_status(timeout: int):
    """
    Load the status of instructor feedback requests.
    Return 2 numbers: the number of unprocessed requests and the number of in-processing requests.
    Unprocessed requests are: 
        request_fulfilled is False AND 
        (request_dispatched_time is Null OR request_dispatched_time is more than {timeout} minutes ago)
    Inprocessing requests are:
        request_fulfilled is False AND 
        request_dispatched_time is within {timeout} minutes
    """
    try:
        now = timezone.now()
        timeout_delta = timedelta(minutes=timeout)
        unprocessed_count = InstructorFeedback.objects.filter(
            request_fulfilled=False
        ).filter(
            models.Q(request_dispatched_time__isnull=True) |
            models.Q(request_dispatched_time__lt=now - timeout_delta)
        ).count()
        inprocessing_count = InstructorFeedback.objects.filter(
            request_fulfilled=False,
            request_dispatched_time__gte=now - timeout_delta
        ).count()
        return unprocessed_count, inprocessing_count
    except Exception as e:
        logger.error(f"Error getting instructor feedback status: {e}")
        raise


def assign_instructor_feedback_request(instructor_id: str, feedback_timeout: int) -> Optional[dict]:
    """
    Return either:
      - A dict containing data needed for an instructor to write feedback, if a request is available.
      - None if no suitable request exists.

    Selection priority:
      1. An in-processing request already assigned to this instructor (still within timeout).
      2. Otherwise, the oldest unprocessed (never dispatched or timed out) request.

    Returned dict keys:
      request_id, problem_id, hint_type, student_program,
      reflection_question, reflection_answer, ai_generated_hint
    """
    try:
        now = timezone.now()
        timeout_delta = timedelta(minutes=feedback_timeout)

        # First: check if this instructor already has an in-processing request
        inproc_qs = (
            InstructorFeedback.objects
            .select_related("ai_hint_request")
            .filter(
                instructor_id=instructor_id,
                request_fulfilled=False,
                request_dispatched_time__gte=now - timeout_delta,
            )
            .order_by("request_dispatched_time")
        )

        feedback_obj = inproc_qs.first()
        if feedback_obj is None:
            # Need to acquire an unprocessed request
            with transaction.atomic():
                unprocessed_qs = (
                    InstructorFeedback.objects
                    .select_for_update(skip_locked=True)
                    .select_related("ai_hint_request")
                    .filter(request_fulfilled=False)
                    .filter(
                        models.Q(request_dispatched_time__isnull=True)
                        | models.Q(request_dispatched_time__lt=now - timeout_delta)
                    )
                    .order_by("created_at", "id")
                )
                feedback_obj = unprocessed_qs.first()
                if feedback_obj:
                    # Update the database: this request is now assigned to the instructor
                    feedback_obj.instructor_id = instructor_id
                    feedback_obj.request_dispatched_time = now
                    feedback_obj.save(
                        update_fields=["instructor_id", "request_dispatched_time"]
                    )
                    logger.info(
                        f"Dispatched feedback request {feedback_obj.id} (AIHintRequest {feedback_obj.ai_hint_request_id}) "
                        f"to instructor {instructor_id}"
                    )
        else:
            logger.info(
                f"Reusing in-processing request {feedback_obj.id} for instructor {instructor_id}"
            )

        if not feedback_obj:
            return None
        
        ai_req = feedback_obj.ai_hint_request

        # Obtain the problem description and optional display name
        prob_desc_resp, prob_desc_status = request_problems({'problem_id': ai_req.problem_id})
        if prob_desc_status != 200:
            logger.error(
                f"Failed to fetch problem description for problem_id={ai_req.problem_id}: status {prob_desc_status}"
            )
            problem_description = None
            problem_name = None
        else:
            problem_description = prob_desc_resp.get("task_description", None)
            problem_name = prob_desc_resp.get("name", ai_req.problem_id)

        return {
            "instructor_request_id": feedback_obj.id,
            "request_id": ai_req.id,
            "problem_id": ai_req.problem_id,
            "problem_description": problem_description,
            "name": problem_name,
            "hint_type": ai_req.hint_type,
            "student_program": ai_req.student_program,
            "student_notebook": ai_req.student_notebook,
            "reflection_question": ai_req.reflection_question,
            "reflection_answer": ai_req.reflection_answer,
            "ai_hint": ai_req.returned_hint,
            "student_notes": feedback_obj.student_notes,
        }
    except Exception as e:
        logger.error(f"Error loading instructor feedback request: {e}")
        raise


def save_instructor_feedback(
    instructor_request_id,
    instructor_id,
    feedback
):
    """
    Save feedback from an instructor.
    """
    try:
        feedback_obj = InstructorFeedback.objects.get(id=instructor_request_id)
        feedback_obj.request_fulfilled = True
        feedback_obj.instructor_id = instructor_id
        feedback_obj.instructor_feedback = feedback
        feedback_obj.instructor_feedback_time = timezone.now()
        feedback_obj.save()
    except Exception as e:
        logger.error(f"Error saving instructor feedback: {e}")
        raise