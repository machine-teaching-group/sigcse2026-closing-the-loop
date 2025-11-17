import logging
import os

from django.http import JsonResponse

from ai_hint.utils.db_utils import add_reflection as add_reflection_db
from ai_hint.utils.queue_utils import publish_task

logger = logging.getLogger(__name__)


def execute_add_reflection(arguments):
    logger.info(f"Executing add_reflection with arguments: {arguments}")
    
    # Extract reflection data
    request_id = arguments["data"]["request_id"]
    reflection_question = arguments["data"]["reflection_question"]
    reflection_answer = arguments["data"]["reflection_answer"]

    # Add reflection data to the database
    try:
        _, ready_for_hint_generation = add_reflection_db(
            request_id=request_id,
            reflection_question=reflection_question,
            reflection_answer=reflection_answer
        )
    except Exception as e:
        logger.error(f"Error adding reflection data to database: {e}")
        return JsonResponse(f"Error adding reflection data to database: {e}", status=500)

    # Publish task to queue
    if ready_for_hint_generation:
        publish_task(
            type="generate_hint",
            tries=1,
            data={"request_id": request_id},
            priority=int(os.environ["GENERATE_HINT_PRIORITY"]),
        )