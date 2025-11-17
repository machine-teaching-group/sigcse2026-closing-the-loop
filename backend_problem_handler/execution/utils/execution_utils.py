from pathlib import Path
import logging
import re
import resource
import subprocess
from typing import List
import uuid


logger = logging.getLogger(__name__)


def run_program_on_test_cases(
        program: str,
        test_template: str,
        test_cases: List[str],
        execution_path: Path,
        timeout: int
    ):
    """
    Run the student's program with the provided test cases.
    1. Write the testing program using the test template, program, and test cases into a temporary file
    2. Run the testing program and parse the output
    3. Remove the temporary test file
    4. Return the results
    """
    # Write the testing program using the test template, program, and test cases
    test_content = test_template.replace(
        r"###{{{ INPUT_PROGRAM }}}###", program
    ).replace(
        r"###{{{ TEST_CASES }}}###", "\n\n".join(test_cases)
    )

    test_program_path = execution_path / f"test_{uuid.uuid4().hex}.py"
    logger.info(f"Writing temporary test program to {test_program_path}")
    with open(test_program_path, "w") as f:
        f.write(test_content)

    # Run the testing program
    usage_before = resource.getrusage(resource.RUSAGE_CHILDREN)
    try:
        test = subprocess.run(
            ["python", test_program_path.name],
            cwd=execution_path,
            capture_output=True,
            timeout=timeout,
        )
        test_stderr = test.stderr.decode().strip()
        if test_stderr:
            correctness = False
            buggy_output = _sanitize_error_line(test_stderr)
        else:
            correctness = True
            buggy_output = ""
    except (TimeoutError, subprocess.TimeoutExpired):
        correctness = False
        buggy_output = "Time limit exceeded"
    usage_after = resource.getrusage(resource.RUSAGE_CHILDREN)
    elapsed_time = (usage_after.ru_utime - usage_before.ru_utime) + (usage_after.ru_stime - usage_before.ru_stime)
    logger.info(f"Test program finished in {elapsed_time:.2f} seconds, correctness: {correctness}, buggy output: {buggy_output}")

    # Remove the temporary test file
    test_program_path.unlink()

    # Return
    return correctness, buggy_output, elapsed_time


def _sanitize_error_line(error_msg: str) -> str:
    """Return a cleaned error summary without line numbers/details.

    Strategy:
        1. Keep only the last line of the traceback (the actual error message).
        2. If it looks like 'SomeError: message', reduce to just 'SomeError'.
    """
    line = error_msg.strip().split("\n")[-1]
    m = re.match(r"^([A-Za-z_]+Error)\b", line)
    if m:
        return m.group(1)
    return line.strip()