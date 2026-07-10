from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class HealthResponse(BaseModel):
    status: str
    database: str
    database_connected: bool | None = None
    active_challenges_count: int | None = None
    active_challenge_slugs: list[str] | None = None


class UserResponse(BaseModel):
    telegram_id: int
    display_name: str
    username: str | None
    photo_url: str | None
    tokens: int
    xp: int
    total_xp: int
    level: int
    next_level_progress: int
    referrals_count: int


class ChallengeResponse(BaseModel):
    id: int | None = None
    slug: str | None = None
    title: str | None = None
    description: str | None = None
    exercise: str
    progress: int
    goal: int
    reward_tokens: int = 0
    is_active: bool = True
    xp: int
    level: int
    next_level_progress: int
    completed: bool = False
    status: str = "active"


class AchievementResponse(BaseModel):
    code: str
    title: str
    icon: str


class LeaderboardUserResponse(BaseModel):
    id: int
    telegram_id: int
    username: str | None
    first_name: str | None
    avatar_url: str | None
    xp: int
    level: int
    balance: int
    approved_workouts: int


class LeaderboardEntryResponse(LeaderboardUserResponse):
    rank: int


class LeaderboardCurrentUserResponse(LeaderboardUserResponse):
    pass


class MyLeaderboardRankResponse(BaseModel):
    rank: int
    total_users: int
    users_above: int
    users_below: int
    user: LeaderboardCurrentUserResponse


class LeaderboardListResponse(BaseModel):
    total_users: int
    items: list[LeaderboardEntryResponse]


class LeaderboardAroundEntryResponse(LeaderboardEntryResponse):
    is_current_user: bool


class LeaderboardAroundMeResponse(BaseModel):
    rank: int
    total_users: int
    items: list[LeaderboardAroundEntryResponse]


class TelegramAuthRequest(BaseModel):
    initData: str = Field(min_length=1)


class ProfileResponse(BaseModel):
    telegram_id: int
    username: str | None
    first_name: str | None
    last_name: str | None
    avatar_url: str | None
    tokens: int
    xp: int
    total_xp: int
    level: int
    next_level_progress: int
    streak_days: int
    ref_code: str | None
    referred_by: int | None


class AvatarUpdateRequest(BaseModel):
    avatar_url: str = Field(min_length=1, max_length=2_500_000)


SubmissionType = Literal["pullups", "pushups", "plank", "running"]
SubmissionStatus = Literal["pending", "approved", "rejected"]


class SubmissionCreateRequest(BaseModel):
    type: SubmissionType
    value: float = Field(ge=0)
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
    value: float
    video_file_id: str | None
    video_url: str | None
    status: SubmissionStatus
    moderator_comment: str | None
    created_at: datetime
    reviewed_at: datetime | None
