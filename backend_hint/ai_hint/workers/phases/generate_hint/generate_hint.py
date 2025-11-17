import logging
import os

from ai_hint.utils.db_utils import (
    add_generated_hint,
    add_hint_generation_phase,
    load_correct_enhanced_programs,
    load_program_enhancement_phase,
    load_reflection,
    load_request,
    update_program_enhancement_phase,
)
from user_customizable_configs.ai_config.loader import get_ai_config
from ai_hint.utils.openai_utils import ask_chatgpt
from ai_hint.workers.phases.generate_hint.parse_response import parse_hint_response
from ai_hint.workers.phases.generate_hint.create_prompt import (
    create_prompt_for_hint_generation,
)
from ai_hint.workers.phases.generate_hint.select_best_enhancement import (
    select_enhanced_program_by_edit_distance,
    select_enhanced_program_by_run_time,
)
from ai_hint.utils.queue_utils import publish_task
from ai_hint.workers.phases.generate_enhanced_programs.query_for_task_description import query_task_details

logger = logging.getLogger(__name__)


def execute_generate_hint(arguments):
    logger.info(f"Executing generate_hint with arguments: {arguments}")

    # Extract data
    request_id = arguments["data"]["request_id"]
    request = load_request(request_id)
    hint_type = request.hint_type
    correct_enhanced_program_objs = load_correct_enhanced_programs(request_id)

    # Select the best correct enhanced program
    if hint_type in {"plan", "debug"}:
        student_program = request.student_program
        best_enhanced_program = select_enhanced_program_by_edit_distance(
            student_program, correct_enhanced_program_objs
        )
    else:  # hint_type == "optimize"
        best_enhanced_program = select_enhanced_program_by_run_time(
            correct_enhanced_program_objs
        )

    # Update the database with the best enhanced program and number of correct enhancements
    program_enhancement_phase = load_program_enhancement_phase(request_id)
    if program_enhancement_phase:
        update_program_enhancement_phase(
            program_enhancement_phase.id,
            n_correct_enhancements=len(correct_enhanced_program_objs),
            best_enhanced_program=best_enhanced_program,
        )

    # Prepare a prompt for generating hint
    try:
        problem_id = request.problem_id
        task_description, template_code = query_task_details(problem_id)
        reflection_obj = load_reflection(request_id)
    except Exception as e:
        logger.error(f"Failed to load configuration data for request {request_id}: {e}")
        raise

    prompt = create_prompt_for_hint_generation(
        task_description=task_description,
        program_code=request.student_program,
        program_output=request.student_program_output,
        enhanced_program=best_enhanced_program,
        hint_type=hint_type,
        reflection=reflection_obj.reflection_answer,
        template_code=template_code,
    )
    logger.info(f"Created hint-generation prompt for request {request_id}:\n{prompt}")

    # Load AI config
    try:
        ai_config = get_ai_config()
    except Exception as e:
        logger.error(f"Error loading AI config: {e}")
        raise

    # Generate a hint
    query_output, waiting_seconds = ask_chatgpt(
        messages=prompt,
        model=ai_config.hint_generation_model.name,
        temperature=ai_config.hint_generation_model.temperature,
        response_format="json_object",
    )

    # Save the hint to the database
    if query_output.choices:
        text_output = query_output.choices[0].message.content
        explanation, hint = parse_hint_response(text_output)

    add_hint_generation_phase(
        request_id=request_id,
        prompt=str(prompt),
        model_id=ai_config.hint_generation_model.name,
        model_temperature=ai_config.hint_generation_model.temperature,
        whole_llm_response=text_output,
        llm_waiting_seconds=waiting_seconds,
    )
    add_generated_hint(
        request_id=request_id,
        hint=hint,
        explanation=explanation,
        job_finished_successfully=True,
    )

    # Publish task to push the hint and related data to the orchestration backend
    publish_task(
        type="return_hint",
        tries=1,
        data={"request_id": request_id},
        priority=int(os.environ["RETURN_HINT_PRIORITY"]),
    )