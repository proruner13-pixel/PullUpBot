from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class HealthResponse(BaseModel):
    status: str
    database: str


class UserResponse(BaseModel):
    telegram_id: int
    display_name: str
    username: str | None
    photo_url: str | None
    tokens: int
    referrals_count: int


class ChallengeResponse(BaseModel):
    exercise: str
    progress: int
    goal: int
    level: int


class AchievementResponse(BaseModel):
    code: str
    title: str
    icon: str


class TelegramAuthRequest(BaseModel):
    initData: str = Field(min_length=1)


class ProfileResponse(BaseModel):
    telegram_id: int
    username: str | None
    first_name: str | None
    last_name: str | None
    avatar_url: str | None
    tokens: int
    level: int
    streak_days: int
    ref_code: str | None
    referred_by: int | None


class AvatarUpdateRequest(BaseModel):
    avatar_url: str = Field(min_length=1, max_length=2_500_000)


SubmissionType = Literal["pullups", "pushups", "plank", "running"]
SubmissionStatus = Literal["pending", "approved", "rejected"]


class SubmissionCreateRequest(BaseModel):
    type: SubmissionType
    value: int = Field(ge=0)
    video_file_id: str | None = Field(default=None, min_length=1, max_length=1024)
    video_url: str | None = Field(default=None, min_length=1, max_length=2048)

    @field_validator("video_file_id", "video_url")
    @classmethod
    def normalize_video_source(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("video_url")
    @classmethod
    def validate_video_url(cls, value: str | None) -> str | None:
        if value is not None and not value.lower().startswith(
            ("https://", "http://")
        ):
            raise ValueError("video_url must use http or https")
        return value

    @model_validator(mode="after")
    def validate_video_source(self) -> "SubmissionCreateRequest":
        if not self.video_file_id and not self.video_url:
            raise ValueError("video_file_id or video_url is required")
        return self


class SubmissionResponse(BaseModel):
    id: int
    user_id: int
    type: SubmissionType
    value: int
    video_file_id: str | None
    video_url: str | None
    status: SubmissionStatus
    moderator_comment: str | None
    created_at: datetime
    reviewed_at: datetime | None
