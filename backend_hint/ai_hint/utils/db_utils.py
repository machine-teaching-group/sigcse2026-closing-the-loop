import logging
from typing import Tuple
from django.db import IntegrityError, transaction, connection, models

from ai_hint.models import EnhancedProgram, HintGenerationPhase, ProgramEnhancementPhase, Request, Reflection, Hint


logger = logging.getLogger(__name__)


def add_request(
    request_id: int,
    problem_id: str,
    hint_type: str,
    student_program: str = "",
    student_notebook: dict = None,
) -> Request:
    """
    Add a Request to the database.
    Raises IntegrityError if the request_id already exists.
    """
    
    try:
        obj = Request.objects.create(
            request_id=request_id,
            problem_id=problem_id,
            student_program=student_program,
            student_notebook=student_notebook,
            hint_type=hint_type,
        )
        logger.info("Request %s added to database", request_id)
        return obj
    except IntegrityError:
        logger.error("Request %s already exists (not updating)", request_id)
        raise
    except Exception:
        logger.exception("Failed to add request %s to database", request_id)
        raise


def update_request_with_test_results(
    request_id: int,
    student_program_output: str,
    run_time: float
) -> Tuple[Request, bool]:
    """
    Update an existing Request with the results of running the student program.
    Returns a boolean indicating if data is ready for hint generation.
    """
    _acquire_advisory(request_id)
    try:
        with transaction.atomic():
            # Lock the Request row
            req = (Request.objects.select_for_update().get(request_id=request_id))

            # Update fields
            req.student_program_output = student_program_output
            req.run_time = run_time
            req.save(update_fields=[
                "student_program_output",
                "run_time"
            ])
            logger.info(f"Request {request_id} updated with test results")

            return req, is_data_ready_for_hint_generation(request_id)
    except Request.DoesNotExist:
        logger.error(f"Request {request_id} does not exist (cannot update)")
        raise
    except Exception:
        logger.exception(f"Failed to update request {request_id}")
        raise
    finally:
        _release_advisory(request_id)


def load_request(request_id: int) -> Request:
    """
    Load an existing Request from the database.
    """
    try:
        return Request.objects.get(request_id=request_id)
    except Request.DoesNotExist:
        logger.error("Cannot load request %s: does not exist", request_id)
        raise


def add_reflection(
    request_id: int,
    reflection_question: str,
    reflection_answer: str
) -> Tuple[Reflection, bool]:
    """
    Add a Reflection for an existing Request.
    """
    _acquire_advisory(request_id)
    try:
        with transaction.atomic():
            req = Request.objects.get(request_id=request_id)

            # Create the Reflection object
            reflection = Reflection.objects.create(
                request=req,
                reflection_question=reflection_question,
                reflection_answer=reflection_answer,
            )
            logger.info(f"Reflection added to database for request {request_id}. Reflection: {reflection.reflection_answer}")

            return reflection, is_data_ready_for_hint_generation(request_id)
    except Request.DoesNotExist:
        logger.error(f"Request {request_id} does not exist (cannot add reflection)")
        raise
    except IntegrityError:
        logger.error(f"Reflection for request {request_id} already exists (not adding)")
        raise
    except Exception as e:
        logger.exception(f"Failed to add reflection for request {request_id} to database. Error: {e}")
        raise
    finally:
        _release_advisory(request_id)


def load_reflection(request_id: int) -> Reflection | None:
    """
    Load the Reflection for a given request ID.
    """
    try:
        return Reflection.objects.get(request__request_id=request_id)
    except Reflection.DoesNotExist:
        logger.error(f"Cannot load Reflection: not found for request id {request_id}")
        return None
    except Exception:
        logger.error(f"Failed loading Reflection for request id {request_id}")
        return None


def add_program_enhancement_phase(
    request_id: int,
    prompt: str,
    model_id: str,
    model_temperature: float,
    model_n: int,
    whole_llm_response: str,
    llm_waiting_seconds: float,
) -> ProgramEnhancementPhase:
    """
    Create (once) the ProgramEnhancementPhase for a request.
    Raises IntegrityError if it already exists.
    """
    _acquire_advisory(request_id)
    try:
        with transaction.atomic():
            req = Request.objects.select_for_update().get(request_id=request_id)
            phase = ProgramEnhancementPhase.objects.create(
                request=req,
                prompt=prompt,
                model_id=model_id,
                model_temperature=model_temperature,
                model_n=model_n,
                whole_llm_response=whole_llm_response,
                llm_waiting_seconds=llm_waiting_seconds,
            )
            logger.info(f"ProgramEnhancementPhase {phase.id} created for request {request_id} (model_n={model_n})")
            return phase
    except Request.DoesNotExist:
        logger.error(f"Cannot create ProgramEnhancementPhase: request {request_id} does not exist")
        raise
    except Exception:
        logger.exception(f"Failed creating ProgramEnhancementPhase for request {request_id}")
        raise
    finally:
        _release_advisory(request_id)


def update_program_enhancement_phase(
    program_enhancement_phase_id: int,
    n_correct_enhancements: int,
    best_enhanced_program: str | None,
) -> ProgramEnhancementPhase:
    """
    Update outcome fields (n_correct_enhancements, best_enhanced_program) for the phase.
    """
    try:
        with transaction.atomic():
            phase = ProgramEnhancementPhase.objects.select_for_update().get(id=program_enhancement_phase_id)
            phase.n_correct_enhancements = n_correct_enhancements
            phase.best_enhanced_program = best_enhanced_program
            phase.save(update_fields=["n_correct_enhancements", "best_enhanced_program"])
            logger.info(
                f"ProgramEnhancementPhase updated for phase id {program_enhancement_phase_id} (n_correct={n_correct_enhancements}, best_set={best_enhanced_program is not None})",
            )
            return phase
    except ProgramEnhancementPhase.DoesNotExist:
        logger.error("Cannot update ProgramEnhancementPhase outcome: phase missing for phase id %s", program_enhancement_phase_id)
        raise
    except Exception:
        logger.exception("Failed updating ProgramEnhancementPhase outcome for phase id %s", program_enhancement_phase_id)
        raise


def load_program_enhancement_phase(
    request_id: int
) -> ProgramEnhancementPhase | None:
    """
    Load the ProgramEnhancementPhase for a given request ID.
    """
    try:
        return ProgramEnhancementPhase.objects.filter(request__request_id=request_id).order_by("-id").first()
    except ProgramEnhancementPhase.DoesNotExist:
        logger.error(f"Cannot load ProgramEnhancementPhase: not found for request id {request_id}")
        return None
    except Exception:
        logger.error(f"Failed loading ProgramEnhancementPhase for request id {request_id}")
        return None


def add_enhanced_program(
    phase_id: int,
    enhanced_program: str,
) -> EnhancedProgram:
    """
    Add an EnhancedProgram row tied to the request's ProgramEnhancementPhase.
    Raises if the phase does not exist.
    """
    try:
        phase = ProgramEnhancementPhase.objects.get(id=phase_id)
    except ProgramEnhancementPhase.DoesNotExist:
        logger.error(f"Cannot add EnhancedProgram: phase not found for phase id {phase_id}")
        raise

    try:
        ep = EnhancedProgram.objects.create(
            phase=phase,
            enhanced_program=enhanced_program,
        )
        logger.info(
            f"EnhancedProgram {ep.id} added for phase id {phase_id}"
        )
        return ep
    except Exception:
        logger.exception(f"Failed adding EnhancedProgram for phase id {phase_id}")
        raise


def update_enhanced_program(
    enhanced_program_id: int,
    is_correct: bool | None,
    program_output: str | None = None,
    run_time: float | None = None,
) -> Tuple[EnhancedProgram, bool]:
    """
    Update an existing EnhancedProgram with correctness, output and runtime.
    Returns a boolean indicating if data is ready for hint generation.
    """
    try:
        request_id = EnhancedProgram.objects.get(id=enhanced_program_id).phase.request.request_id
    except Exception as e:
        logger.error(f"Error acquiring request_id for EnhancedProgram {enhanced_program_id}: {e}")
        raise
    
    _acquire_advisory(request_id)
    try:
        with transaction.atomic():
            ep = EnhancedProgram.objects.select_for_update().get(id=enhanced_program_id)
            ep.is_correct = is_correct
            ep.program_output = program_output
            ep.run_time = run_time
            ep.save(update_fields=["is_correct", "program_output", "run_time"])
            logger.info(f"EnhancedProgram updated for program id {enhanced_program_id}")
            return ep, is_data_ready_for_hint_generation(request_id)
    except EnhancedProgram.DoesNotExist:
        logger.error(f"Cannot update EnhancedProgram: not found for id {enhanced_program_id}")
        raise
    except Exception:
        logger.exception(f"Failed updating EnhancedProgram for id {enhanced_program_id}")
        raise
    finally:
        _release_advisory(request_id)


def load_enhanced_program(enhanced_program_id: int) -> EnhancedProgram:
    """
    Load an existing EnhancedProgram by ID.
    """
    try:
        return EnhancedProgram.objects.get(id=enhanced_program_id)
    except EnhancedProgram.DoesNotExist:
        logger.error(f"Cannot load EnhancedProgram: not found for id {enhanced_program_id}")
        raise
    except Exception:
        logger.exception(f"Failed loading EnhancedProgram for id {enhanced_program_id}")
        raise


def load_correct_enhanced_programs(request_id: int) -> list[EnhancedProgram]:
    """
    Load all correct EnhancedPrograms for a given request ID.
    """
    try:
        return list(EnhancedProgram.objects.filter(phase__request__request_id=request_id, is_correct=True))
    except Exception:
        logger.exception(f"Failed loading correct EnhancedPrograms for request {request_id}")
        raise


def add_hint_generation_phase(
    request_id: int,
    prompt: str,
    model_id: str,
    model_temperature: float,
    whole_llm_response: str,
    llm_waiting_seconds: float,
) -> HintGenerationPhase:
    """
    Add a new HintGenerationPhase for a given request.
    """
    try:
        req = Request.objects.get(request_id=request_id)
    except Request.DoesNotExist:
        logger.error(f"Cannot add HintGenerationPhase: request not found for id {request_id}")
        raise

    try:
        phase = HintGenerationPhase.objects.create(
            request=req,
            prompt=prompt,
            model_id=model_id,
            model_temperature=model_temperature,
            whole_llm_response=whole_llm_response,
            llm_waiting_seconds=llm_waiting_seconds,
        )
        logger.info(f"HintGenerationPhase added for request {request_id}")
        return phase
    except Exception:
        logger.exception(f"Failed adding HintGenerationPhase for request {request_id}")
        raise


def add_generated_hint(
    request_id: int,
    hint: str,
    explanation: str,
    job_finished_successfully: bool,
    generation_error_message: str | None = None,
) -> Hint:
    """
    Add a Hint with the returned hint and mark it as finished.
    """
    try:
        req = Request.objects.get(request_id=request_id)
    except Request.DoesNotExist:
        logger.error("Error: Cannot update request %s: does not exist", request_id)
        raise

    try:
        hint_obj = Hint.objects.create(
            request=req,
            hint=hint,
            explanation=explanation,
            job_finished_successfully=job_finished_successfully,
            generation_error_message=generation_error_message,
        )
        logger.info(f"Hint added to database for request {request_id}. Hint: {hint}")

        return hint_obj
    except Exception as e:
        logger.exception(f"Failed to add hint for request {request_id} to database. Error: {e}", )
        raise


def load_hint(request_id: int) -> Hint:
    """
    Load the generated hint for a given request ID.
    """
    try:
        return Hint.objects.get(request__request_id=request_id)
    except Hint.DoesNotExist:
        logger.error(f"Cannot load Hint: not found for request id {request_id}")
        raise
    except Exception:
        logger.exception(f"Failed loading Hint for request id {request_id}")
        raise


def load_other_hint_data(request_id: int) -> dict:
    """
    Aggregate all recorded data involved in hint generation for a request.
    Uses dynamic field extraction so future model field changes are auto‑reflected.
    """
    try:
        req = Request.objects.get(request_id=request_id)
    except Request.DoesNotExist:
        logger.error("load_other_hint_data: request %s not found", request_id)
        return {}

    reflection = Reflection.objects.filter(request=req).first()
    prog_phase = (
        ProgramEnhancementPhase.objects
        .filter(request=req)
        .order_by("-id")
        .first()
    )
    hint_gen_phase = HintGenerationPhase.objects.filter(request=req).order_by("-id").first()
    hint = Hint.objects.filter(request=req).order_by("-id").first()

    enhanced_programs = []
    if prog_phase:
        for ep in EnhancedProgram.objects.filter(phase=prog_phase).order_by("id"):
            enhanced_programs.append(_serialize_instance(ep))

    return {
        "request": _serialize_instance(req),
        "reflection": _serialize_instance(reflection),
        "program_enhancement_phase": _serialize_instance(prog_phase),
        "enhanced_programs": enhanced_programs,
        "hint_generation_phase": _serialize_instance(hint_gen_phase),
        "hint": _serialize_instance(hint),
    }
    

def is_data_ready_for_hint_generation(
    request_id: int
) -> bool:
    """
    Determine if a request is ready for hint generation.

    Conditions:
      1. Request exists.
      2. Student program has been run (student_program_output and run_time not None).
      3. A Reflection exists.
      4. A ProgramEnhancementPhase exists.
      5. The expected number (model_n) of EnhancedProgram rows for THAT phase have been created.
      6. Each EnhancedProgram for the phase has not-None is_correct.

    Returns:
        bool (True if all conditions satisfied, else False)
    """
    try:
        req = Request.objects.get(request_id=request_id)
    except Request.DoesNotExist:
        logger.warning(f"Readiness check: request id{request_id} missing")
        return False

    # 2. Student program run?
    if req.student_program_output is None or req.run_time is None:
        logger.info(f"Readiness check: request id{request_id} student program not yet run")
        return False

    # 3. Reflection exists?
    if not Reflection.objects.filter(request=req).exists():
        logger.info(f"Readiness check: request id {request_id} missing reflection")
        return False

    # 4. Enhancement phase
    phase = (
        ProgramEnhancementPhase.objects
        .filter(request=req)
        .order_by("-id")  # pick latest if multiple
        .first()
    )
    if phase is None:
        logger.info(f"Readiness check: request id {request_id} has no ProgramEnhancementPhase")
        return False

    expected = phase.model_n

    # 5. Enhanced programs for THIS phase
    eps_qs = EnhancedProgram.objects.filter(phase=phase)
    generated = eps_qs.count()
    if generated < expected:
        logger.info(f"Readiness check: request id {request_id} enhanced programs not all created ({generated}/{expected})")
        return False

    # 6. Validate each enhanced program has is_correct
    enhancement_run = eps_qs.filter(is_correct__isnull=False).count()
    if enhancement_run < generated:
        logger.info(f"Readiness check: request id {request_id} has only {enhancement_run} / {generated} enhanced programs run")
        return False

    logger.info(f"Readiness check: request id {request_id} READY")
    return True


def _acquire_advisory(request_id):
    with connection.cursor() as cur:
        cur.execute("SELECT pg_advisory_lock(%s);", [request_id])


def _release_advisory(request_id):
    with connection.cursor() as cur:
        cur.execute("SELECT pg_advisory_unlock(%s);", [request_id])


def _serialize_instance(obj):
    """
    Serialize a Django model instance including ALL concrete (non M2M, non reverse) fields.
    - ForeignKey fields become their primary key value.
    - Datetimes converted to ISO strings.
    """
    if obj is None:
        return None
    data = {}
    for field in obj._meta.get_fields():
        if not getattr(field, "concrete", False):
            continue
        if field.many_to_many:
            continue
        if field.auto_created and not field.concrete:
            continue
        name = field.name
        try:
            value = getattr(obj, name)
        except Exception:
            continue
        if isinstance(value, models.Model):
            value = value.pk
        elif hasattr(value, "isoformat"):
            try:
                value = value.isoformat()
            except Exception:
                pass
        data[name] = value
    return data