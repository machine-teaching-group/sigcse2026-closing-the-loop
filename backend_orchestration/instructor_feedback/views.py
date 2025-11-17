import json
import logging
import os
from typing import Optional, Tuple

import requests  # For fetching problem descriptions
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from ai_hint.models import AIHintRequest
from instructor_feedback.models import InstructorFeedback
from instructor_feedback.utils.email_utils import send_email
from user_customizable_configs.instructor_feedback.loader import get_instructor_feedback_config
from instructor_feedback.utils.db_utils import add_instructor_feedback_request, get_all_instructor_feedback_requests, get_instructor_feedback_status, assign_instructor_feedback_request, load_instructor_feedback_request, save_instructor_feedback

logger = logging.getLogger(__name__)


@csrf_exempt
def add_request(request):
    """
    Receive request for instructor feedback
    1. Verify request method is POST.
    2. Validate and extract request data.
    3. Add request to database.
    4. Notify instructors.
    """
    # Verify request method
    if request.method != "POST":
        return HttpResponse(status=405)

    # Extract parameters: get request data
    try:
        payload = json.loads(request.body)
        request_id = payload["request_id"]
        student_email = payload.get("student_email")
        student_notes = payload.get("student_notes")
    except Exception as e:
        logger.error(f"Error extracting feedback request data: {e}")
        return HttpResponse(status=400)

    # Add request to database
    try:
        add_instructor_feedback_request(
            request_id=request_id,
            student_email=student_email,
            student_notes=student_notes,
        )
    except Exception as e:
        logger.error(f"Error adding feedback request to database: {e}")
        return HttpResponse(f"Error adding request to the database: {e}", status=500)

    # Notify instructors
    try:
        system_email = os.environ["NOTIFICATION_SENDER_EMAIL"]
        system_email_password = os.environ["NOTIFICATION_SENDER_PASSWORD"]
        instructor_config = get_instructor_feedback_config()
        feedback_timeout = instructor_config.feedback_timeout
        n_unprocessed, n_inprocessing = get_instructor_feedback_status(timeout=feedback_timeout)
    except Exception as e:
        logger.error(f"Error loading info for notifying instructors: {e}")
        return HttpResponse(f"Instructor request received, but there was an error notifying instructors: {e}", status=200)
    
    try:
        for instructor in instructor_config.instructors:
            send_email(
                sender_email=system_email,
                sender_password=system_email_password,
                recipient_email=instructor.email,
                subject=instructor_config.instructor_notification_email.subject.format(
                    n_unprocessed_requests=n_unprocessed,
                    n_inprocessing_requests=n_inprocessing,
                ),
                body=instructor_config.instructor_notification_email.body.format(
                    n_unprocessed_requests=n_unprocessed,
                    n_inprocessing_requests=n_inprocessing,
                ),
            )
    except Exception as e:
        logger.error(f"Error notifying instructors: {e}")
        return HttpResponse(f"Instructor request received, but there was an error notifying instructors: {e}", status=200)

    logger.info(f"[x] Instructor request received successfully for AI-hint {request_id}")
    return HttpResponse(status=200)


def query_feedback(request):
    """
    Query the feedback for a specific instructor request.
    """

    # Verify request method
    if request.method != "GET":
        return HttpResponse(status=405)

    # Extract and validate request parameters
    try:
        instructor_request_id = request.GET["instructor_request_id"]
    except KeyError as e:
        logger.error(f"Missing parameter in query_feedback: {e}")
        return HttpResponse(status=400)

    # Fetch feedback from the database
    try:
        rqs: Tuple[InstructorFeedback, AIHintRequest] | None = load_instructor_feedback_request(instructor_request_id)
    except Exception as e:
        logger.error(f"Error fetching feedback: {e}")
        return HttpResponse(f"Error fetching feedback: {e}", status=500)

    if rqs is None:
        logger.error(f"Feedback request {instructor_request_id} not found")
        return HttpResponse(f"Feedback request {instructor_request_id} not found", status=404)
    
    feedback_request, _ = rqs

    result = json.dumps({
        "instructor_request_id": instructor_request_id,
        "job_finished": feedback_request.request_fulfilled,
        "feedback": feedback_request.instructor_feedback,
    })
    logger.info(f"[x] Fetched feedback for instructor request {instructor_request_id}: {result}")
    return HttpResponse(result, content_type="application/json")


def query_all_feedback(request):
    """
    Query all completed feedback for a specific pair of student_id and problem_id.
    """
    # Verify request method
    if request.method != "GET":
        return HttpResponse(status=405)

    # Extract and validate request parameters
    try:
        student_id = request.GET["student_id"]
        problem_id = request.GET["problem_id"]
    except KeyError as e:
        logger.error(f"Missing parameter in query_all_feedback: {e}")
        return HttpResponse(status=400)

    # Fetch feedback from the database
    try:
        feedback_requests = get_all_instructor_feedback_requests(student_id, problem_id)
    except Exception as e:
        logger.error(f"Error fetching all feedback: {e}")
        return HttpResponse(f"Error fetching all feedback: {e}", status=500)

    json_result = json.dumps(feedback_requests)
    logger.info(f"[x] Fetched all completedfeedback for student {student_id} and problem {problem_id}: {len(feedback_requests)} feedback requests")
    return HttpResponse(json_result, content_type="application/json")


def fetch_request(request):
    """
    Handle query regarding fetching a feedback request.
    1. Verify request method is GET.
    2. Extract and validate request parameters.
    3. Assign and fetch a feedback request from the database.
    4. Return the feedback request details.
    """
    # Verify request method
    if request.method != "GET":
        return HttpResponse(status=405)

    # Extract and validate request parameters
    try:
        instructor_id = request.GET["instructor_id"]
    except KeyError as e:
        logger.error(f"Missing parameter in fetch_request: {e}")
        return HttpResponse(status=400)

    # Assign and fetch a feedback request from the database
    try:
        instructor_config = get_instructor_feedback_config()
        feedback_timeout = instructor_config.feedback_timeout
        feedback_request: Optional[dict] = assign_instructor_feedback_request(
            instructor_id=instructor_id,
            feedback_timeout=feedback_timeout
        )
    except Exception as e:
        logger.error(f"Error fetching feedback request: {e}")
        return HttpResponse(f"Error fetching feedback request: {e}", status=500)

    # Return the feedback request details
    if feedback_request is None:
        logger.info(f"No feedback request available for instructor {instructor_id}")
        result = {}
    else:
        logger.info(f"Fetched a feedback request for instructor {instructor_id}")
        result = json.dumps(feedback_request)

    return HttpResponse(result, content_type="application/json")


@csrf_exempt
def save_feedback(request):
    """
    Receive and save feedback from instructors.
    1. Verify request method is POST.
    2. Extract and validate request parameters.
    3. Save feedback to the database.
    4. Notify the student and instructors about status updates.
    """
    # Verify request method
    if request.method != "POST":
        return HttpResponse(status=405)

    # Extract and validate request parameters
    try:
        payload = json.loads(request.body)
        instructor_request_id = payload["instructor_request_id"]
        instructor_id = payload["instructor_id"]
        feedback = payload["feedback"]
    except (KeyError, json.JSONDecodeError) as e:
        logger.error(f"Error extracting feedback parameters: {e}")
        return HttpResponse(status=400)

    # Save feedback to the database
    try:
        save_instructor_feedback(
            instructor_request_id=instructor_request_id,
            instructor_id=instructor_id,
            feedback=feedback
        )
    except Exception as e:
        logger.error(f"Error saving feedback: {e}")
        return HttpResponse(f"Error saving feedback: {e}", status=500)

    # Notify the student and instructors about status updates
    try:  # Get data
        system_email = os.environ["NOTIFICATION_SENDER_EMAIL"]
        system_email_password = os.environ["NOTIFICATION_SENDER_PASSWORD"]
        instructor_config = get_instructor_feedback_config()
        feedback_timeout = instructor_config.feedback_timeout
        n_unprocessed, n_inprocessing = get_instructor_feedback_status(timeout=feedback_timeout)
    except Exception as e:
        logger.error(f"Error loading info for notifications: {e}")
    try:  # Notify student
        feedback_request, ai_request = load_instructor_feedback_request(instructor_request_id)
        if feedback_request is not None and feedback_request.student_email is not None:
            problem_id = ai_request.problem_id
            send_email(
                sender_email=system_email,
                sender_password=system_email_password,
                recipient_email=feedback_request.student_email,
                subject=instructor_config.student_notification_email.subject.format(
                    problem_id=problem_id
                ),
                body=instructor_config.student_notification_email.body.format(
                    problem_id=problem_id
                )
            )
    except Exception as e:
        logger.error(f"Error notifying student: {e}")
    try:  # Notify instructors
        for instructor in instructor_config.instructors:
            send_email(
                sender_email=system_email,
                sender_password=system_email_password,
                recipient_email=instructor.email,
                subject=instructor_config.instructor_notification_email.subject.format(
                    n_unprocessed_requests=n_unprocessed,
                    n_inprocessing_requests=n_inprocessing,
                ),
                body=instructor_config.instructor_notification_email.body.format(
                    n_unprocessed_requests=n_unprocessed,
                    n_inprocessing_requests=n_inprocessing,
                ),
            )
    except Exception as e:
        logger.error(f"Error notifying instructors: {e}")

    return HttpResponse(status=200)


@csrf_exempt
def save_feedback_rating(request):
    """
    Receive and save a feedback rating.
    1. Validate request method is POST.
    2. Extract request parameters.
    3. Save the feedback rating to the database.
    4. Return a success response.
    """
    # Validate request method
    if request.method != "POST":
        return HttpResponse(status=405)

    # Extract request parameters
    try:
        payload = json.loads(request.body)
        instructor_request_id = payload["instructor_request_id"]
        is_feedback_helpful = payload["is_feedback_helpful"]
    except (KeyError, json.JSONDecodeError) as e:
        logger.error(f"Error extracting feedback rating parameters: {e}")
        return HttpResponse(status=400)

    # Save the feedback rating to the database
    try:
        feedback_request, _ = load_instructor_feedback_request(instructor_request_id)
        if feedback_request is None:
            logger.error(f"Feedback request {instructor_request_id} not found")
            return HttpResponse(f"Feedback request {instructor_request_id} not found", status=404)
        feedback_request.is_feedback_helpful = is_feedback_helpful
        feedback_request.feedback_rated_time = timezone.now()
        feedback_request.save()
    except Exception as e:
        logger.error(f"Error saving feedback rating: {e}")
        return HttpResponse(f"Error saving feedback rating: {e}", status=500)

    logger.info(f"[x] Saved feedback rating for instructor request {instructor_request_id}")
    return HttpResponse(status=200)