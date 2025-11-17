from functools import lru_cache
from pathlib import Path
from typing import Dict, List

from natsort import natsorted
import yaml
from pydantic import BaseModel, Field, PositiveInt, field_validator

from backend_problem_handler.settings import (
    PROGRAMMING_TASK_CONFIGS_TASK_METADATA,
    PROGRAMMING_TASK_CONFIGS_TASK_DESCRIPTIONS,
    PROGRAMMING_TASK_CONFIGS_TEMPLATE_CODE,
    PROGRAMMING_TASK_CONFIGS_TEST_TEMPLATES,
    PROGRAMMING_TASK_CONFIGS_TEST_CASES,
    PROGRAMMING_TASK_CONFIGS_EXECUTION_BOXES,
)


REQUIRED_TASK_FIELDS = {
    "task_description_file",
    "template_code_file",
    "test_template_file",
    "test_case_files",
    "execution_dir",
    "timeout",
}


class TaskMetadata(BaseModel):
    problem_id: str = Field(..., description="Unique task ID (YAML key).")
    name: str | None = Field(default=None, description="Human-friendly task name.") # Optional human-friendly name
    task_description_file: str
    template_code_file: str
    test_template_file: str
    test_case_files: str
    execution_dir: str
    timeout: PositiveInt

    @property
    def description_path(self) -> Path:
        return PROGRAMMING_TASK_CONFIGS_TASK_DESCRIPTIONS / self.task_description_file

    @property
    def template_code_path(self) -> Path:
        return PROGRAMMING_TASK_CONFIGS_TEMPLATE_CODE / self.template_code_file

    @property
    def test_template_path(self) -> Path:
        return PROGRAMMING_TASK_CONFIGS_TEST_TEMPLATES / self.test_template_file

    @property
    def test_case_paths(self) -> List[Path]:
        return natsorted(list(Path(PROGRAMMING_TASK_CONFIGS_TEST_CASES).glob(self.test_case_files)))

    @property
    def execution_dir_path(self) -> Path:
        return PROGRAMMING_TASK_CONFIGS_EXECUTION_BOXES / self.execution_dir


class TaskMetadataLoadError(RuntimeError):
    pass


def _parse_yaml(path: Path) -> Dict[str, TaskMetadata]:
    with path.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}

    if not isinstance(raw, dict):
        raise TaskMetadataLoadError("Root YAML must be a mapping.")

    tasks_section = raw.get("tasks")
    if not isinstance(tasks_section, dict):
        raise TaskMetadataLoadError("'tasks' key missing or not a mapping.")

    base_dir = path.parent
    tasks: Dict[str, TaskMetadata] = {}

    for problem_id, data in tasks_section.items():
        if not isinstance(data, dict):
            raise TaskMetadataLoadError(f"Task '{problem_id}' must map to a dict.")

        missing = REQUIRED_TASK_FIELDS - data.keys()
        if missing:
            raise TaskMetadataLoadError(
                f"Task '{problem_id}' missing required fields: {', '.join(sorted(missing))}"
            )

        # Pull optional friendly name; default to problem_id if not provided
        data_with_id_and_name = {**data}
        data_with_id_and_name.setdefault("name", problem_id)

        model = TaskMetadata(
            problem_id=problem_id,
            base_dir=base_dir,
            **data_with_id_and_name,
        )
        tasks[problem_id] = model

    return tasks

def _validate_file_existence(tasks: Dict[str, TaskMetadata]) -> None:
    missing: List[str] = []
    for t in tasks.values():
        if not t.description_path.is_file():
            missing.append(f"{t.problem_id}: missing description {t.description_path}")
        if not t.template_code_path.is_file():
            missing.append(f"{t.problem_id}: missing template code {t.template_code_path}")
        if not t.test_template_path.is_file():
            missing.append(f"{t.problem_id}: missing test template {t.test_template_path}")
        for p in t.test_case_paths:
            if not p.is_file():
                missing.append(f"{t.problem_id}: missing test case {p}")
        if not t.execution_dir_path.is_dir():
            missing.append(f"{t.problem_id}: missing execution dir {t.execution_dir_path}")
    if missing:
        raise TaskMetadataLoadError(
            "File existence validation failed:\n  " + "\n  ".join(missing)
        )

@lru_cache(maxsize=2)
def load_task_metadata(strict_files: bool = False) -> List[TaskMetadata]:
    path = Path(PROGRAMMING_TASK_CONFIGS_TASK_METADATA).resolve()
    if not path.is_file():
        raise TaskMetadataLoadError(f"Metadata file not found: {path}")
    tasks = _parse_yaml(path)
    if strict_files:
        _validate_file_existence(tasks)
    return [tasks[k] for k in sorted(tasks.keys())]

def reload_task_metadata() -> None:
    load_task_metadata.cache_clear()

def get_task_metadata(strict_files: bool = False) -> List[TaskMetadata]:
    return load_task_metadata(strict_files=strict_files)

def get_task(problem_id: str, strict_files: bool = False) -> TaskMetadata:
    for task in load_task_metadata(strict_files=strict_files):
        if task.problem_id == problem_id:
            return task
    raise KeyError(f"Unknown problem_id '{problem_id}'")