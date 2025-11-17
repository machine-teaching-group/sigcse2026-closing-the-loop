from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field, field_validator, model_validator

from backend_orchestration.settings import QUOTA_CONFIGS


class QuotaLoadError(RuntimeError):
	"""Raised when the quota configuration cannot be loaded or validated."""


class HintQuota(BaseModel):
	"""Per-problem hint quotas.

	max_hints_per_problem=None means unlimited overall, while per-type caps still apply.
	All numeric caps must be >= 0.
	"""
	max_planning_hints_per_problem: Optional[int] = Field(None, description="Max planning hints per problem (None = unlimited)")
	max_debugging_hints_per_problem: Optional[int] = Field(None, description="Max debugging hints per problem (None = unlimited)")
	max_optimization_hints_per_problem: Optional[int] = Field(None, description="Max optimization hints per problem (None = unlimited)")
	max_hints_per_problem: Optional[int] = Field(default=None, description="Overall max hints per problem (None = unlimited)")

	@field_validator(
		"max_planning_hints_per_problem",
		"max_debugging_hints_per_problem",
		"max_optimization_hints_per_problem",
		"max_hints_per_problem", 
		mode="before"
	)
	@classmethod
	def _coerce_none(cls, v):
		# Accept YAML values like None/"None"/null/~ and coerce to Python None
		if v is None:
			return None
		if isinstance(v, str) and v.strip().lower() in {"none", "null", "~", ""}:
			return None
		return v

	@field_validator(
		"max_planning_hints_per_problem",
		"max_debugging_hints_per_problem",
		"max_optimization_hints_per_problem",
		"max_hints_per_problem",
		mode="after",
	)
	@classmethod
	def _non_negative_optional(cls, v: Optional[int]) -> Optional[int]:
		if v is None:
			return None
		if v < 0:
			raise ValueError("Quota values must be non-negative")
		return v


class QuotaConfig(BaseModel):
	hint_quota: HintQuota


@lru_cache(maxsize=1)
def load_quota_config() -> QuotaConfig:
	"""Load and validate the quota configuration from YAML (cached)."""
	path = QUOTA_CONFIGS
	print(f"Loading quota config from {path}")
	if not path.is_file():
		raise QuotaLoadError(f"Quota config file not found: {path}")
	try:
		with path.open("r", encoding="utf-8") as f:
			data = yaml.safe_load(f) or {}
	except Exception as e:
		raise QuotaLoadError(f"Failed to read quota config: {e}") from e

	try:
		return QuotaConfig(**data)
	except Exception as e:
		raise QuotaLoadError(f"Invalid quota config: {e}") from e


def get_hint_quota() -> HintQuota:
	"""Convenience accessor for the hint quota section."""
	return load_quota_config().hint_quota
