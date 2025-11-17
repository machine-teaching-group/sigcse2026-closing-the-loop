import logging

from ai_hint.models import AIHintRequest
from user_customizable_configs.quota.loader import get_hint_quota


logger = logging.getLogger(__name__)


class QuotaExceededError(Exception):
    """Raised when a student exceeds their hint quota."""


def query_used_hints(student_id: str, problem_id: str) -> dict:
    """Query the number of used hints for a student and problem."""
    base_qs = AIHintRequest.objects.filter(
        student_id=student_id,
        problem_id=problem_id,
    ).exclude(job_finished_successfully=False)

    overall_count = base_qs.count()
    plan_count = base_qs.filter(hint_type="plan").count()
    debug_count = base_qs.filter(hint_type="debug").count()
    optimize_count = base_qs.filter(hint_type="optimize").count()

    return {
        "overall": overall_count,
        "plan": plan_count,
        "debug": debug_count,
        "optimize": optimize_count,
    }

def enforce_hint_quota(student_id: str, problem_id: str, hint_type: str) -> bool:
    """Enforce the hint quota for a student and problem.

    Returns True if the student is within quota, raises QuotaExceededError otherwise.
    """
    quota = get_hint_quota()
    
    used_hint_counts = query_used_hints(student_id, problem_id)

    quota_left = compute_quota_left(
        limits={
            "overall": quota.max_hints_per_problem,
            "plan": quota.max_planning_hints_per_problem,
            "debug": quota.max_debugging_hints_per_problem,
            "optimize": quota.max_optimization_hints_per_problem,
        },
        used=used_hint_counts,
    )

    if quota_left["overall"] is not None and quota_left["overall"] <= 0:
        msg = (
            f"Hint quota exceeded: overall={used_hint_counts['overall']} reached max={quota.max_hints_per_problem} "
            f"for student={student_id} problem={problem_id}"
        )
        logger.info(msg)
        raise QuotaExceededError(msg)

    if hint_type in {"plan", "debug", "optimize"}:
        if quota_left[hint_type] is not None and quota_left[hint_type] <= 0:
            msg = (
                f"Hint quota exceeded for type '{hint_type}': count={used_hint_counts[hint_type]}"
                f"for student={student_id} problem={problem_id}"
            )
            logger.info(msg)
            raise QuotaExceededError(msg)

    return True

def compute_quota_left(limits: dict, used: dict) -> dict:
    left = {}
    for key in limits:
        if limits[key] is None:
            left[key] = None
        else:
            left[key] = max(0, limits[key] - used.get(key, 0))
    return left