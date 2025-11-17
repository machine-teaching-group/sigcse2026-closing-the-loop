import os
import logging
from typing import Dict
from django.http import JsonResponse
import requests


logger = logging.getLogger(__name__)


def request_problems(params) -> tuple[Dict, int]:
    base_url = os.getenv("BACKEND_PROBLEM_HANDLER_GET_PROBLEMS_URL")

    try:
        resp = requests.get(base_url, params=params)
    except requests.RequestException as e:
        logger.error("Network error proxying programming problems: %s", e)
        return {"error": "Upstream network error", "detail": str(e)}, 502

    try:
        data = resp.json()
        return data, resp.status_code
    except ValueError:
        return {
            "error": "Upstream returned non-JSON",
            "status_code": resp.status_code,
            "body": resp.text[:500],
        }, 502 if resp.status_code == 200 else resp.status_code