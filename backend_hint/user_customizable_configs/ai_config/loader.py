from functools import lru_cache
import yaml
from pydantic import BaseModel, Field, PositiveInt, field_validator

from backend_hint.settings import AI_MODEL_CONFIGS


class ProgramGenerationModel(BaseModel):
    name: str = Field(default="gpt-5")
    temperature: float = Field(ge=0.0, le=2.0, default=0.5)
    n_programs: PositiveInt = Field(default=5)

    @field_validator("n_programs")
    @classmethod
    def cap_n(cls, v: int) -> int:
        if v > 20:
            raise ValueError("n_programs too large (>20)")
        return v


class HintGenerationModel(BaseModel):
    name: str = Field(default="gpt-5")
    temperature: float = Field(ge=0.0, le=2.0, default=0.0)


class AIConfig(BaseModel):
    program_generation_model: ProgramGenerationModel = ProgramGenerationModel()
    hint_generation_model: HintGenerationModel = HintGenerationModel()


@lru_cache(maxsize=1)
def load_ai_config() -> AIConfig:
    path = AI_MODEL_CONFIGS
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    return AIConfig(**raw)


def get_ai_config() -> AIConfig:
    return load_ai_config()

