import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote_plus, urlsplit

from dotenv import dotenv_values, load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ROOT_ENV_FILE = PROJECT_ROOT / ".env"
SECRET_PLACEHOLDERS = {
    "",
    "change_me",
    "dbname",
    "host",
    "password",
    "port",
    "user",
    "your_password",
    "your_telegram_bot_token",
    "your_token",
}
DATABASE_ENV_KEYS = (
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
)


def load_project_env() -> Path:
    """Load the project-root .env without overriding Railway/system env."""
    load_dotenv(ROOT_ENV_FILE, override=False)
    return ROOT_ENV_FILE


def root_env_keys() -> tuple[str, ...]:
    if not ROOT_ENV_FILE.exists():
        return ()
    return tuple(
        sorted(
            str(key)
            for key in dotenv_values(ROOT_ENV_FILE)
            if key
        )
    )


def is_placeholder(value: str | None) -> bool:
    return (value or "").strip().lower() in SECRET_PLACEHOLDERS


def is_database_url_template(database_url: str | None) -> bool:
    value = (database_url or "").strip()
    if not value:
        return False
    upper = value.upper()
    return any(
        marker in upper
        for marker in (
            "://USER:",
            ":PASSWORD@",
            "@HOST:",
            ":PORT/",
            "/DBNAME",
            "YOUR_",
            "EXAMPLE",
        )
    )


def mask_database_url(database_url: str) -> str:
    """Return a DSN safe for logs; password and query are never exposed."""
    try:
        parsed = urlsplit(database_url)
    except ValueError:
        return "<invalid DATABASE_URL>"

    if not parsed.scheme or not parsed.hostname:
        return "<invalid DATABASE_URL>"

    username = parsed.username or "<user>"
    host = parsed.hostname
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    try:
        parsed_port = parsed.port
    except ValueError:
        return "<invalid DATABASE_URL>"
    port = f":{parsed_port}" if parsed_port else ""
    database = parsed.path or "/<database>"
    return f"{parsed.scheme}://{username}:***@{host}{port}{database}"


def database_url_source() -> str:
    try:
        _, source, template_detected = resolve_database_url_details()
    except RuntimeError:
        explicit = os.getenv("DATABASE_URL", "").strip()
        return (
            "template detected"
            if is_database_url_template(explicit)
            else "missing"
        )
    if template_detected:
        return f"{source} (template detected)"
    return source


def resolve_database_url_details(
    environment: str | None = None,
) -> tuple[str, str, bool]:
    load_project_env()
    explicit_url = os.getenv("DATABASE_URL", "").strip()
    template_detected = is_database_url_template(explicit_url)
    if explicit_url and not template_detected:
        return explicit_url, "explicit DATABASE_URL", False

    values = {
        key: os.getenv(key, "").strip()
        for key in DATABASE_ENV_KEYS
    }
    missing = [
        key
        for key, value in values.items()
        if not value or is_placeholder(value)
    ]
    if missing:
        reason = (
            "найден шаблон, а DB_* неполные"
            if template_detected
            else "DATABASE_URL отсутствует, а DB_* неполные"
        )
        raise RuntimeError(
            "DATABASE_URL не настроен: "
            f"{reason}. Не заданы: {', '.join(missing)}. "
            f"Проверен файл: {ROOT_ENV_FILE}"
        )

    user = quote_plus(values["DB_USER"])
    password = quote_plus(values["DB_PASSWORD"])
    host = values["DB_HOST"]
    port = values["DB_PORT"]
    database = quote_plus(values["DB_NAME"])
    database_url = (
        f"postgresql://{user}:{password}@{host}:{port}/{database}"
    )
    return database_url, "built from DB_*", template_detected


def resolve_database_url(environment: str | None = None) -> str:
    database_url, _, _ = resolve_database_url_details(environment)
    return database_url


def _validate_production_url(name: str, value: str) -> None:
    if not value:
        raise RuntimeError(f"{name} не задан в production")

    try:
        parsed = urlsplit(value)
    except ValueError as exc:
        raise RuntimeError(
            f"{name} должен быть корректным публичным HTTPS URL"
        ) from exc

    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not hostname:
        raise RuntimeError(
            f"{name} должен быть корректным публичным HTTPS URL"
        )
    if hostname in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError(f"{name} не может указывать на localhost в production")


@dataclass(frozen=True, slots=True)
class Settings:
    app_name: str
    environment: str
    database_dsn: str
    bot_token: str
    admin_id: int
    webapp_url: str
    api_url: str
    upload_dir: Path
    telegram_auth_max_age: int
    cors_origins: tuple[str, ...]

    @classmethod
    def from_env(cls) -> "Settings":
        load_project_env()
        environment = os.getenv("APP_ENV", "development").lower()
        bot_token = os.getenv("BOT_TOKEN", "").strip()
        if is_placeholder(bot_token):
            bot_token = ""

        origins = tuple(
            origin.strip().rstrip("/")
            for origin in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:5173,https://pullupbot.vercel.app",
            ).split(",")
            if origin.strip()
        )

        upload_dir_value = os.getenv("UPLOAD_DIR", "uploads").strip() or "uploads"
        upload_dir = Path(upload_dir_value)
        if not upload_dir.is_absolute():
            upload_dir = PROJECT_ROOT / upload_dir

        settings = cls(
            app_name=os.getenv("APP_NAME", "PULLUP API"),
            environment=environment,
            database_dsn=resolve_database_url(environment),
            bot_token=bot_token,
            admin_id=int(os.getenv("ADMIN_ID", "0")),
            webapp_url=os.getenv("WEBAPP_URL", "").strip().rstrip("/"),
            api_url=os.getenv("API_URL", "").strip().rstrip("/"),
            upload_dir=upload_dir,
            telegram_auth_max_age=int(
                os.getenv("TELEGRAM_AUTH_MAX_AGE", "86400")
            ),
            cors_origins=origins,
        )

        if environment == "production":
            if not settings.bot_token:
                raise RuntimeError("BOT_TOKEN не задан в production")
            _validate_production_url("WEBAPP_URL", settings.webapp_url)
            for origin in settings.cors_origins:
                _validate_production_url("CORS_ORIGINS", origin)

            parsed_database = urlsplit(settings.database_dsn)
            if parsed_database.scheme not in {"postgresql", "postgres"}:
                raise RuntimeError("DATABASE_URL должен быть PostgreSQL URL")

            database_host = (parsed_database.hostname or "").lower()
            if database_host in {"localhost", "127.0.0.1", "::1"}:
                raise RuntimeError(
                    "DATABASE_URL не может указывать на localhost в production"
                )

        return settings
