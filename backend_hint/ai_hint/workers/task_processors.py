import os
import time
import logging

from ai_hint.utils.queue_utils import publish_task
from ai_hint.utils.db_utils import add_generated_hint
from ai_hint.workers.phases.run_enhanced_program.run_enhanced_program import execute_run_enhanced_program
from ai_hint.workers.phases.run_student_program.run_student_program import (
    execute_run_student_buggy_program,
)
from ai_hint.workers.phases.generate_enhanced_programs.generate_enhanced_programs import (
    execute_generate_enhanced_programs,
)
from ai_hint.workers.phases.add_reflection.add_reflection import execute_add_reflection
from ai_hint.workers.phases.generate_hint.generate_hint import execute_generate_hint
from ai_hint.workers.phases.return_hint.return_hint import execute_return_hint


logger = logging.getLogger(__name__)


def set_request_unsuccessful(arguments, e):
    try:
        request_id = arguments["data"]["request_id"]
        # Extract meaningful messages from the exception 'e'
        generation_error_message = f"Exception type: {type(e).__name__}; Message: {str(e)}"
        # If the exception has additional attributes, include them
        if hasattr(e, 'args') and e.args:
            generation_error_message += f"; Args: {e.args}"
        if hasattr(e, '__cause__') and e.__cause__:
            generation_error_message += f"; Cause: {e.__cause__}"
        if hasattr(e, '__context__') and e.__context__:
            generation_error_message += f"; Context: {e.__context__}"

        add_generated_hint(
            request_id=request_id,
            hint="Sorry, we cannot generate a hint. Please try again later.",
            explanation="",
            job_finished_successfully=False,
            generation_error_message=generation_error_message,
        )

        execute_return_hint(arguments)

    except Exception as e:
        logger.error(f"Error setting request unsuccessful for request {arguments}: {e}")


def process_task(arguments):
    try:
        if arguments["type"] == "run_student_buggy_program":
            execute_run_student_buggy_program(arguments)
        elif arguments["type"] == "query_for_enhanced_programs":
            execute_generate_enhanced_programs(arguments)
        elif arguments["type"] == "run_enhanced_program":
            execute_run_enhanced_program(arguments)
        elif arguments["type"] == "add_reflection":
            execute_add_reflection(arguments)
        elif arguments["type"] == "generate_hint":
            execute_generate_hint(arguments)
        elif arguments["type"] == "return_hint":
            execute_return_hint(arguments)
        else:
            raise ValueError(f"Unknown task type: {arguments['type']}")
    except Exception as e:
        logger.error(f"Error processing request {arguments}. Error: {e}")
        # If the number of tries is less than the maximum allowed, re-enqueue the task
        if ("tries" in arguments) and (
            arguments["tries"] < int(os.environ["MAX_TRIES"])
        ):
            arguments["tries"] += 1
            logger.info(
                f" [x] Re-enqueuing request {arguments} with tries {arguments['tries']}"
            )
            publish_task(
                type=arguments["type"],
                tries=arguments["tries"],
                data=arguments["data"],
                priority=int(os.environ["RETRY_PRIORITY"]),
            )
            time.sleep(1)  # Encourage other workers to process this task
        else:
            logger.error(
                f" [x] Request {arguments} has reached the maximum number of tries."
            )
            set_request_unsuccessful(arguments, e)
