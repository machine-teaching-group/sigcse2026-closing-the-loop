import logging
import os

from ai_hint.models import Request
from ai_hint.utils.db_utils import load_enhanced_program, update_enhanced_program
from ai_hint.utils.queue_utils import publish_task
from ai_hint.utils.program_execution_utils import run_program_on_test_cases

logger = logging.getLogger(__name__)


def execute_run_enhanced_program(arguments):
    logger.info(f"Executing run_enhanced_program with arguments: {arguments}")
    
     # Load program and problem config
    enhanced_program_id = arguments["data"]["enhanced_program_id"]
    try:
        enhanced_program_obj = load_enhanced_program(enhanced_program_id)
        enhanced_program = enhanced_program_obj.enhanced_program
        problem_id = enhanced_program_obj.phase.request.problem_id
    except Exception as e:
        logger.error(f"Error loading data for running enhanced program {enhanced_program_id}: {e}")
        raise

    # Run enhanced program
    program_verdict, program_output, run_time = run_program_on_test_cases(
        problem_id=problem_id,
        program=enhanced_program,
    )

    # Update results to the database
    try:
        enhanced_program_obj, ready_for_hint_generation = update_enhanced_program(
            enhanced_program_id=enhanced_program_id,
            is_correct=program_verdict,
            program_output=program_output,
            run_time=run_time,
        )
    except Exception as e:
        logger.error(f"Error updating results for enhanced program {enhanced_program_id}: {e}")
        raise

    # Check if all information is ready for hint generation and if so, generate a hint
    if ready_for_hint_generation:
        # Generate hint
        logger.info(f"Ready to generate hint")
        publish_task(
            type="generate_hint",
            tries=1,
            data={"request_id": enhanced_program_obj.phase.request.request_id},
            priority=int(os.environ["GENERATE_HINT_PRIORITY"]),
        )