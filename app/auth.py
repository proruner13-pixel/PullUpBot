import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader

from app.config import Settings


telegram_auth = APIKeyHeader(name="Authorization", auto_error=False)


@dataclass(frozen=True, slots=True)
class TelegramUser:
    id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None

    @property
    def display_name(self) -> str:
        return " ".join(
            part for part in (self.first_name, self.last_name) if part
        )


def validate_init_data(
    init_data: str,
    bot_token: str,
    max_age: int,
    now: int | None = None,
) -> TelegramUser:
    if not bot_token:
        raise ValueError("BOT_TOKEN is not configured")

    values = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = values.pop("hash", None)
    if not received_hash:
        raise ValueError("Telegram hash is missing")

    auth_date_raw = values.get("auth_date")
    user_raw = values.get("user")
    if not auth_date_raw or not user_raw:
        raise ValueError("Telegram auth_date or user is missing")

    try:
        auth_date = int(auth_date_raw)
    except ValueError as exc:
        raise ValueError("Telegram auth_date is invalid") from exc

    current_time = int(time.time()) if now is None else now
    if auth_date > current_time + 30 or current_time - auth_date > max_age:
        raise ValueError("Telegram initData has expired")

    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(values.items())
    )
    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    expected_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise ValueError("Telegram signature is invalid")

    try:
        user_data = json.loads(user_raw)
        return TelegramUser(
            id=int(user_data["id"]),
            first_name=(
                str(user_data["first_name"])
                if user_data.get("first_name") is not None
                else None
            ),
            last_name=user_data.get("last_name"),
            username=user_data.get("username"),
            photo_url=user_data.get("photo_url"),
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("Telegram user payload is invalid") from exc


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


async def get_current_user(
    authorization: str | None = Depends(telegram_auth),
    settings: Settings = Depends(get_settings),
) -> TelegramUser:
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telegram initData is required",
        )

    scheme, separator, init_data = authorization.partition(" ")
    if (
        not separator
        or scheme.lower() != "tma"
        or not init_data.strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telegram initData is required",
        )

    try:
        return validate_init_data(
            init_data.strip(),
            settings.bot_token,
            settings.telegram_auth_max_age,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
