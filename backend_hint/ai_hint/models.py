from django.db import models


class Request(models.Model):
    request_id = models.IntegerField(primary_key=True)
    problem_id = models.CharField(max_length=100)
    student_program = models.TextField()
    student_notebook = models.JSONField(null=True, blank=True, default=None)
    hint_type = models.CharField(max_length=20)

    student_program_output = models.TextField(null=True)
    run_time = models.FloatField(null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Reflection(models.Model):
    request = models.OneToOneField(Request, on_delete=models.CASCADE)
    reflection_question = models.TextField()
    reflection_answer = models.TextField()

    created_at = models.DateTimeField(auto_now_add=True)


class ProgramEnhancementPhase(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE)
    prompt = models.TextField()
    model_id = models.CharField(max_length=100)
    model_temperature = models.FloatField()
    model_n = models.IntegerField()
    whole_llm_response = models.TextField()
    llm_waiting_seconds = models.FloatField()

    n_correct_enhancements = models.IntegerField(null=True)
    best_enhanced_program = models.TextField(null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class EnhancedProgram(models.Model):
    phase = models.ForeignKey(ProgramEnhancementPhase, on_delete=models.CASCADE)
    enhanced_program = models.TextField()
    is_correct = models.BooleanField(null=True)
    program_output = models.TextField(null=True)
    run_time = models.FloatField(null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class HintGenerationPhase(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE)
    prompt = models.TextField()
    model_id = models.CharField(max_length=100)
    model_temperature = models.FloatField()
    whole_llm_response = models.TextField()
    llm_waiting_seconds = models.FloatField()

    created_at = models.DateTimeField(auto_now_add=True)


class Hint(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE)
    hint = models.TextField()
    explanation = models.TextField()
    job_finished_successfully = models.BooleanField()
    generation_error_message = models.TextField(null=True)

    created_at = models.DateTimeField(auto_now_add=True)