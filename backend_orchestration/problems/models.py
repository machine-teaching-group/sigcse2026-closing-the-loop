from django.db import models


class ProgramExecution(models.Model):
	student_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
	problem_id = models.CharField(max_length=255, db_index=True)
	program = models.TextField()
	
	execution_id = models.IntegerField(unique=True)

	correctness = models.BooleanField(null=True, blank=True)
	output = models.TextField(null=True, blank=True)
	elapsed_time = models.FloatField(null=True, blank=True)
	# Execution status
	is_success = models.BooleanField(null=True, blank=True)
	error_message = models.TextField(null=True, blank=True)
	
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		indexes = [
			models.Index(fields=["student_id", "problem_id"]),
		]
		ordering = ["-created_at"]

	def __str__(self) -> str:
		sid = self.student_id or "<anon>"
		return f"Exec[{sid}:{self.problem_id}] #{self.pk}"
