import os
import time
from pathlib import Path
from typing import Dict, Sequence
import logging

import openai
from openai import OpenAI


logger = logging.getLogger(__name__)


def ask_chatgpt(
    messages: Sequence[Dict[str, str]],
    model: str,
    temperature: float,
    response_format: str,  # can be 'json_object` or `text`
    n: int=1,
    presence_penalty=0,
    frequency_penalty=0,
):
    """
    Query OpenAI's API with handling of errors.
    """
    while True:
        try:
            start_time = time.time()
            # Query
            request_output = client.chat.completions.create(
                model=model,
                messages=messages,
                n=n,
                temperature=temperature,
                presence_penalty=presence_penalty,
                frequency_penalty=frequency_penalty,
                response_format={"type": response_format},
            )
            end_time = time.time()
            waiting_seconds = end_time - start_time

            return request_output, waiting_seconds

        except openai.RateLimitError:
            logger.error("Rate limited")
            time.sleep(5)
        except openai.APIStatusError as e:
            logger.error("Status error")
            logger.error(f"Status: {e.status_code}, Response: {e.response}, Message: {getattr(e, 'message', '<<unknown>>')}")
            time.sleep(5)
        except openai.APITimeoutError:
            logger.error("Timeout")
            time.sleep(5)
        except (
            openai.APIConnectionError,
            openai.APIError,
        ):
            time.sleep(15)
        except KeyError as e:
            logger.error(f"KeyError when invoking OpenAI client: {e}")


# Load openai
api_key = os.environ["OPENAI_API_KEY"]
logger.info(f"Loaded OpenAI API key: {api_key[:5]}***")
client = OpenAI(api_key=api_key)
