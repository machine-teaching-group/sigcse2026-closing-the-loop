from django.db import models
from django.utils import timezone


class AIHintRequest(models.Model):
    student_id = models.CharField(max_length=100, null=True, blank=True)
    problem_id = models.CharField(max_length=100)
    student_program = models.TextField()
    student_notebook = models.JSONField(null=True, blank=True, default=None)
    hint_type = models.CharField(max_length=20)
    other_input_data = models.JSONField(null=True, blank=True, default=dict)

    # Reflection
    reflection_question = models.TextField(null=True, blank=True)
    reflection_answer = models.TextField(null=True, blank=True)
    reflection_time = models.DateTimeField(null=True, blank=True)

    # Hint result
    job_finished_successfully = models.BooleanField(null=True)
    generation_error_message = models.TextField(null=True, blank=True)
    returned_hint = models.TextField(null=True, blank=True)
    returned_time = models.DateTimeField(null=True, blank=True)
    other_hint_data = models.JSONField(null=True, blank=True, default=dict)

    # Rating
    is_hint_helpful = models.BooleanField(null=True)
    hint_rated_time = models.DateTimeField(null=True, blank=True)

    # Cancellation flag – when True, indicates the student cancelled this request
    is_cancelled = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["student_id"]),
            models.Index(fields=["problem_id"]),
            models.Index(fields=["hint_type"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"AIHintRequest(id={self.id}, problem={self.problem_id})"


class BackAIHintRequest(models.Model):
    original_request = models.ForeignKey(
        AIHintRequest,
        related_name="back_requests",
        on_delete=models.CASCADE,
    )
    result_returned = models.BooleanField(default=False)
    returned_time = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"BackAIHintRequest(id={self.id}, original={self.original_request_id})"


