import os
import logging
from typing import Optional, Tuple
import requests

logger = logging.getLogger(__name__)


class TaskDescriptionQueryError(RuntimeError):
    """Raised when fetching a task description fails."""


def query_task_details(problem_id: str) -> Tuple[str, Optional[str]]:
    """
    Fetch the task description and template code for the given problem_id
    from the problem handler backend (via orchestration).

    Returns:
        A tuple of (task_description, template_code). template_code can be None if not available.

    Raises:
        ValueError: if problem_id is empty.
        TaskDescriptionQueryError: on network / protocol / backend errors or missing description.
    """
    if not problem_id or not isinstance(problem_id, str):
        raise ValueError("problem_id must be a non-empty string")

    url = os.getenv("BACKEND_ORCHESTRATION_GET_PROBLEMS_URL")

    params = {"problem_id": problem_id}

    try:
        resp = requests.get(url, params=params)
    except requests.RequestException as e:
        logger.error(f"Network error querying problem_id={problem_id}: {e}")
        raise TaskDescriptionQueryError(f"Network error: {e}") from e
    except Exception as e:
        logger.error(f"Unexpected error querying problem_id={problem_id}: {e}")
        raise TaskDescriptionQueryError(f"Unexpected error: {e}") from e

    if resp.status_code == 404:
        raise TaskDescriptionQueryError(f"Problem not found: {problem_id}")

    if resp.status_code != 200:
        # Try to pull backend error detail
        try:
            data = resp.json()
            detail = data.get("error") or data
        except Exception:
            detail = resp.text
        raise TaskDescriptionQueryError(
            f"Unexpected status {resp.status_code}: {detail}"
        )

    try:
        data = resp.json()
    except ValueError as e:
        raise TaskDescriptionQueryError(f"Invalid JSON response: {e}") from e

    # The problem handler returns fields including: task_description and template_code
    desc = data.get("task_description")
    if not isinstance(desc, str):
        # Could be an error field if something went wrong
        err = data.get("task_description_error") or data
        raise TaskDescriptionQueryError(
            f"Task description missing for {problem_id}: {err}"
        )
    template_code = data.get("template_code")
    if not isinstance(template_code, str):
        template_code = None

    return desc, template_code
