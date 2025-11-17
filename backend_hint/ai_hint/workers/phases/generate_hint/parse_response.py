import json
from typing import Tuple


def parse_hint_response(text_response) -> Tuple[str, str]:
    """
    Given aa answer from LLMs, this function extract the explanation and hint from the answer.
    """
    if isinstance(text_response, str):
        json_response = json.loads(text_response)
    else:
        json_response = text_response
    explanation = json_response.get("explanation", "")
    if explanation.startswith("(1)"):
        explanation = explanation[3:].lstrip()

    hint = json_response["hint"]
    if hint.startswith("(2)"):
        hint = hint[3:].lstrip()

    return explanation, hint
