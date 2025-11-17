from django.db import models


class ProgramExecution(models.Model):
    problem_id = models.CharField(max_length=255, db_index=True)

    output = models.TextField(null=True, blank=True)
    correctness = models.BooleanField(null=True, blank=True)
    elapsed_time = models.FloatField(null=True, blank=True)
    is_success = models.BooleanField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)