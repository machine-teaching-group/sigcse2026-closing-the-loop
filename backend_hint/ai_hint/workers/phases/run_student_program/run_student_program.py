import logging
import os

from ai_hint.models import Request
from ai_hint.utils.db_utils import add_generated_hint, load_request, update_request_with_test_results
from ai_hint.utils.queue_utils import publish_task
from ai_hint.utils.program_execution_utils import run_program_on_test_cases


logger = logging.getLogger(__name__)


def execute_run_student_buggy_program(arguments):
    logger.info(f"Executing run_student_buggy_program {arguments}")
    
    # Load program and problem config
    request_id=arguments["data"]["request_id"]
    try:
        hint_request: Request = load_request(request_id)
        student_program = hint_request.student_program
    except Exception as e:
        logger.error(f"Error loading student program for request_id {arguments['data']['request_id']}: {e}")
        raise
    
    problem_id = hint_request.problem_id

    # Run student buggy program and save the results to the database
    program_verdict, buggy_output, run_time = run_program_on_test_cases(
        problem_id=problem_id,
        program=student_program,
    )

    # Check if student program is already correct and if so, return early for hint_type in {"plan", "debug"}
    if program_verdict:
        if hint_request.hint_type in {"plan", "debug"}:
            # Save a generated-hint record and immediately publish a return_hint task
            add_generated_hint(
                request_id=request_id,
                hint="Your code seems already correct.",
                explanation="",
                job_finished_successfully=True,
            )
            publish_task(
                type="return_hint",
                tries=1,
                data={"request_id": request_id},
                priority=int(os.environ["RETURN_HINT_PRIORITY"]),
            )
            return  # Early return
        else:
            # In case hint_type is "optimize", make it clear student's output is correct
            assert hint_request.hint_type == "optimize"
            buggy_output = "Student program's output is correct."
    
    _, ready_for_hint_generation = update_request_with_test_results(
        request_id=request_id,
        student_program_output=buggy_output,
        run_time=run_time
    )

    # Check if all information is ready for hint generation and if so, generate a hint
    if ready_for_hint_generation:
        # Generate hint
        logger.info(f"Ready to generate hint")
        publish_task(
            type="generate_hint",
            tries=1,
            data={"request_id": request_id},
            priority=int(os.environ["GENERATE_HINT_PRIORITY"]),
        )