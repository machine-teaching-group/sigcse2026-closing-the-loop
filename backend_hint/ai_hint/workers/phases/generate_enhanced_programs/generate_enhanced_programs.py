import json
import logging
import os

from ai_hint.models import Request
from ai_hint.utils.db_utils import (
    add_enhanced_program,
    add_program_enhancement_phase,
    load_request,
)
from user_customizable_configs.ai_config.loader import get_ai_config
from ai_hint.workers.phases.generate_enhanced_programs.create_prompt import (
    create_prompt_for_enhanced_programs,
)
from ai_hint.utils.queue_utils import publish_task
from ai_hint.utils.openai_utils import ask_chatgpt
from ai_hint.workers.phases.generate_enhanced_programs.query_for_task_description import (
    query_task_details,
)


logger = logging.getLogger(__name__)


def execute_generate_enhanced_programs(arguments):
    """
    Generate enhanced programs based on the provided arguments.
    For planning and debugging hints, enhanced programs focus on bug fixing and solving the problem.
    For optimization hints, enhanced programs focus on optimizing for better performance and readability.
    1. Load program and query problem description
    2. Prepare a prompt
    3. Load AI config
    4. Generate enhanced programs
    5. Save the results to the database
    6. Publish tasks, each for running an enhanced program
    """
    logger.info(f"Executing query_for_enhanced_programs with arguments: {arguments}")

    # Load program and problem config
    request_id = arguments["data"]["request_id"]
    try:
        hint_request: Request = load_request(request_id)
        hint_type = hint_request.hint_type
        modification_type = "repair" if hint_type in {"plan", "debug"} else "optimize"
        program_code = hint_request.student_program
        problem_id = hint_request.problem_id
        task_description, template_code = query_task_details(problem_id)
        logger.info(f"query_for_enhanced_programs loaded request {request_id} with problem_id {problem_id}, hint_type {hint_type}, program `{str(program_code)[:50]}...`, task_description `{str(task_description)[:50]}...`, template_code `{str(template_code)[:50]}...`")
    except Exception as e:
        logger.error(f"Error loading request {request_id} and its problem config: {e}")
        raise

    # Prepare a prompt
    prompt = create_prompt_for_enhanced_programs(
        modification_type=modification_type,
        program_code=program_code,
        task_description=task_description,
        template_code=template_code,
    )
    logger.info(f"Created prompt for generating enhanced programs for request {request_id}:\n{prompt}")

    # Load AI config
    try:
        ai_config = get_ai_config()
    except Exception as e:
        logger.error(f"Error loading AI config: {e}")
        raise

    # Generate enhanced programs
    enhanced_programs = []
    query_output, waiting_seconds = ask_chatgpt(
        messages=prompt,
        model=ai_config.program_generation_model.name,
        temperature=ai_config.program_generation_model.temperature,
        n=ai_config.program_generation_model.n_programs,
        response_format="json_object",
    )

    for choice in query_output.choices:
        if choice.message and choice.message.content:
            llm_answer = choice.message.content
            llm_answer_json = json.loads(llm_answer)
            if modification_type == "repair" and "fixed_program" in llm_answer_json:
                llm_fix = llm_answer_json["fixed_program"]
            elif (
                modification_type == "optimize"
                and "optimized_program" in llm_answer_json
            ):
                llm_fix = llm_answer_json["optimized_program"]
            else:
                llm_fix = ""
            enhanced_programs.append(llm_fix)
        else:
            enhanced_programs.append("")

    if len(enhanced_programs) != ai_config.program_generation_model.n_programs:
        logger.error(
            f"Expected {ai_config.program_generation_model.n_programs} enhanced programs, but got {len(enhanced_programs)} from LLM's answer"
        )
        raise ValueError("Mismatch in number of enhanced programs generated")

    logger.info(
        f"Generated {len(enhanced_programs)} enhanced programs for request {request_id}. Program lengths: {[len(str(p)) for p in enhanced_programs]}"
    )

    # Save the enhancement phase and enhanced programs to the database
    phase = add_program_enhancement_phase(
        request_id=request_id,
        prompt=str(prompt),
        model_id=ai_config.program_generation_model.name,
        model_temperature=ai_config.program_generation_model.temperature,
        model_n=ai_config.program_generation_model.n_programs,
        whole_llm_response=str(query_output),
        llm_waiting_seconds=waiting_seconds,
    )

    enhanced_program_ids = []
    for enhanced_program in enhanced_programs:
        ep = add_enhanced_program(phase_id=phase.id, enhanced_program=enhanced_program)
        enhanced_program_ids.append(ep.id)

    # Publish tasks, each for running an enhanced program
    logger.info(
        f"Publishing {len(enhanced_program_ids)} enhanced programs for request {request_id}"
    )
    for enhanced_program_id in enhanced_program_ids:
        publish_task(
            type="run_enhanced_program",
            tries=1,
            data={"request_id": request_id, "enhanced_program_id": enhanced_program_id},
            priority=int(os.environ["RUN_ENHANCED_PROGRAM_PRIORITY"]),
        )
