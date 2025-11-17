import logging
import os

import requests

from ai_hint.utils.db_utils import load_hint, load_other_hint_data

logger = logging.getLogger(__name__)


def execute_return_hint(arguments):
    logger.info(f"Executing return_hint with arguments: {arguments}")

    # Extract data
    request_id = arguments["data"]["request_id"]
    hint_obj = load_hint(request_id)
    other_hint_data = load_other_hint_data(request_id)

    # Return the hint (post a request to the orchestration backend)
    try:
        response = requests.post(
            f"{os.environ['BACKEND_ORCHESTRATION_SAVE_AI_HINT_URL']}",
            json={
                "request_id": request_id,
                "hint": hint_obj.hint,
                "job_finished_successfully": hint_obj.job_finished_successfully,
                "generation_error_message": hint_obj.generation_error_message,
                "other_hint_data": other_hint_data,
            },
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to return hint for request {request_id}: {e}")
        raise
