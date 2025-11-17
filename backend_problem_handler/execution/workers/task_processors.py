import logging
import os
import time
from typing import Dict

from execution.utils.queue_utils import publish_task
from user_customizable_configs.programming_tasks.task_loader import (
    get_task,
    TaskMetadataLoadError,
)
from execution.utils.execution_utils import run_program_on_test_cases
from execution.models import ProgramExecution

logger = logging.getLogger(__name__)


def _load_task_assets(task) -> Dict[str, str]:
    try:
        test_template = task.test_template_path.read_text(encoding="utf-8")
    except Exception as e:
        raise RuntimeError(f"Failed reading test template: {e}")

    try:
        test_cases = [p.read_text(encoding="utf-8") for p in task.test_case_paths]
    except Exception as e:
        raise RuntimeError(f"Failed reading test cases: {e}")

    return {"test_template": test_template, "test_cases": test_cases}


def execute_program(arguments):
    execution_id = arguments["data"].get("execution_id")
    problem_id = arguments["data"].get("problem_id")
    program = arguments["data"].get("student_program")

    if not problem_id or not isinstance(program, str):
        raise ValueError("Missing problem_id or student_program in data")

    # Fetch task metadata
    try:
        task = get_task(problem_id, strict_files=True)
    except KeyError:
        logger.info(f"Execute requested for unknown problem_id={problem_id}")
        raise
    except TaskMetadataLoadError as e:
        logger.exception(f"Task metadata load error for {problem_id}")
        raise

    # Load test assets
    try:
        assets = _load_task_assets(task)
    except RuntimeError as e:
        logger.exception(f"Asset load failure for {problem_id}")
        raise

    try:
        correctness, buggy_output, elapsed_time = run_program_on_test_cases(
            program=program,
            test_template=assets["test_template"],
            test_cases=assets["test_cases"],
            execution_path=task.execution_dir_path,
            timeout=task.timeout,
        )
    except Exception as e:
        logger.exception(f"Execution failure for {problem_id}: {e}")
        raise

    # Save execution result to database
    exec_rec = ProgramExecution.objects.get(pk=execution_id)
    exec_rec.output = buggy_output
    exec_rec.correctness = correctness
    exec_rec.elapsed_time = elapsed_time
    exec_rec.is_success = True
    exec_rec.save(update_fields=["output", "correctness", "elapsed_time", "is_success"])


def set_unsuccessful(arguments, error_message):
    try:
        if arguments["type"] == "execute_program":
            execution_id = arguments["data"].get("execution_id")
            exec_rec = ProgramExecution.objects.get(pk=execution_id)
            exec_rec.is_success = False
            exec_rec.error = error_message
            exec_rec.save(update_fields=["is_success", "error", "updated_at"])
        else:
            logger.error(f"set_unsuccessful called for unknown task type {arguments['type']}")
    except Exception as e:
        logger.error(
            f"Failed to set execution record unsuccessful for {arguments}: {e}"
        )


def process_task(arguments):
    try:
        if arguments["type"] == "execute_program":
            execute_program(arguments)
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
        else:
            logger.error(
                f" [x] Request {arguments} has reached the maximum number of tries."
            )
            set_unsuccessful(arguments, str(e))
