from django.db import models
from django.utils import timezone

from ai_hint.models import AIHintRequest

# Create your models here.

class InstructorFeedback(models.Model):
    ai_hint_request = models.OneToOneField(
        AIHintRequest,
        on_delete=models.CASCADE,
    )
    student_email = models.CharField(max_length=100, null=True, blank=True)
    student_notes = models.TextField(null=True, blank=True)

    # Queuing information
    request_dispatched_time = models.DateTimeField(null=True, blank=True)
    request_fulfilled = models.BooleanField(default=False)

    # Instructor feedback information
    instructor_id = models.CharField(max_length=100, null=True, blank=True)
    instructor_feedback = models.TextField(null=True, blank=True)
    instructor_feedback_time = models.DateTimeField(null=True, blank=True)

    # Rating
    is_feedback_helpful = models.BooleanField(null=True)
    feedback_rated_time = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"InstructorFeedback(id={self.id}, ai_req={self.ai_hint_request_id})"
