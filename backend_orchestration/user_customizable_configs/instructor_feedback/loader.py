from functools import lru_cache
import yaml
from pydantic import BaseModel, Field, PositiveInt, field_validator

from backend_orchestration.settings import INSTRUCTOR_FEEDBACK_CONFIGS


class Instructor(BaseModel):
    id: int
    name: str
    email: str

class InstructorNotificationEmail(BaseModel):
    subject: str
    body: str

class StudentNotificationEmail(BaseModel):
    subject: str
    body: str

class InstructorFeedbackConfig(BaseModel):
    instructors: list[Instructor]
    feedback_timeout: PositiveInt
    instructor_notification_email: InstructorNotificationEmail
    student_notification_email: StudentNotificationEmail

    @field_validator("instructors")
    @classmethod
    def validate_instructors(cls, instructors):
        if not instructors:
            raise ValueError("Instructors list cannot be empty.")
        return instructors

    @field_validator("feedback_timeout")
    @classmethod
    def validate_feedback_timeout(cls, timeout):
        if timeout <= 0:
            raise ValueError("Feedback timeout must be a positive integer.")
        return timeout


@lru_cache(maxsize=1)
def load_instructor_feedback_config() -> InstructorFeedbackConfig:
    path = INSTRUCTOR_FEEDBACK_CONFIGS
    with open(path, "r") as f:
        config_data = yaml.safe_load(f)
    return InstructorFeedbackConfig(**config_data)


def get_instructor_feedback_config() -> InstructorFeedbackConfig:
    return load_instructor_feedback_config()