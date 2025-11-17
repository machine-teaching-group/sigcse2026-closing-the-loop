import os
import logging
import time

import requests

logger = logging.getLogger(__name__)


class ProgramExecutionError(RuntimeError):
    """Raised when remote program execution fails."""


def run_program_on_test_cases(problem_id: str, program: str) -> tuple[bool, str, float]:
    """
    Delegate execution to the problem handler backend.

    Args:
        problem_id (str): The ID of the programming problem.
        program (str): The student's program code as a string.

    Returns:
        tuple: A tuple containing:
            - correctness (bool): True if all test cases passed, False otherwise.
            - buggy_output (str): The output or error message from the last test case run.
            - elapsed_time (float): The total time taken to run all test cases in seconds.
    """
    if not problem_id or not isinstance(problem_id, str):
        raise ValueError("problem_id must be a non-empty string")
    if not isinstance(program, str):
        raise ValueError("program must be a string")
    
    post_exec_task_url = os.getenv("BACKEND_ORCHESTRATION_EXECUTE_CODE_URL")
    get_exec_result_url = os.getenv("BACKEND_ORCHESTRATION_GET_EXECUTION_RESULT_URL")
    if not post_exec_task_url:
        raise ProgramExecutionError(
            "BACKEND_ORCHESTRATION_EXECUTE_CODE_URL not configured"
        )
    if not get_exec_result_url:
        raise ProgramExecutionError(
            "BACKEND_ORCHESTRATION_GET_EXECUTION_RESULT_URL not configured"
        )

    payload = {
        "problem_id": problem_id,
        "student_program": program,
    }

    # Post the execution request
    try:
        resp = requests.post(post_exec_task_url, json=payload)
    except requests.RequestException as e:
        logger.error(f"Network error executing program_id={problem_id}: {e}")
        raise ProgramExecutionError(f"Network error: {e}") from e
    except Exception as e:
        logger.error(f"Unexpected error executing program_id={problem_id}: {e}")
        raise ProgramExecutionError(f"Unexpected error: {e}") from e

    if resp.status_code != 200:
        # Attempt to extract backend error detail
        try:
            err_json = resp.json()
            detail = err_json.get("detail") or err_json.get("error") or err_json
        except Exception:
            detail = resp.text
        logger.error(
            f"Execution backend error for executing a problem for problem_id={problem_id}: "
            f"status={resp.status_code}, detail={detail}"
        )
        raise ProgramExecutionError(
            f"Execution backend returned {resp.status_code}: {detail}"
        )

    try:
        execution_id = resp.json().get("execution_id")
    except ValueError as e:
        logger.error(f"Error parsing JSON response for executing a program with problem_id={problem_id}: {e}")
        raise ProgramExecutionError(f"Invalid JSON response: {e}") from e

    # Now fetch the execution result
    try:
        while True:
            resp = requests.get(get_exec_result_url, params={"execution_id": execution_id})
            if resp.status_code != 200:
                raise ProgramExecutionError(f"Failed to get execution result, status code: {resp.status_code}")
            data = resp.json()
            job_finished = data.get("job_finished", False)
            if job_finished:
                break
            else:
                time.sleep(3)  # Wait before polling again
    except requests.RequestException as e:
        logger.error(f"Network error fetching execution result for execution_id={execution_id}: {e}")
        raise ProgramExecutionError(f"Network error: {e}") from e
    except Exception as e:
        logger.error(f"Unexpected error fetching execution result for execution_id={execution_id}: {e}")
        raise ProgramExecutionError(f"Unexpected error: {e}") from e

    if "error" in data:
        # Backend reported an error during execution
        logger.error(f"Backend error for executing a problem for problem_id={problem_id}: {data['error']}")
        raise ProgramExecutionError(f"Execution error: {data['error']}")

    # Expected keys: correctness (bool), buggy_output (str), elapsed_time (float)
    if "correctness" not in data or "elapsed_time" not in data or "buggy_output" not in data:
        raise ProgramExecutionError(f"Missing expected fields in response: {data}")

    correctness = bool(data.get("correctness"))
    buggy_output = str(data.get("buggy_output", ""))
    try:
        elapsed_time = float(data.get("elapsed_time", 0.0))
    except (TypeError, ValueError):
        elapsed_time = 0.0

    logger.info(
        f"Remote execution result problem_id={problem_id} correctness={correctness} elapsed={elapsed_time:.4f}",
    )

    return correctness, buggy_output, elapsed_time