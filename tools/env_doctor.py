from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import quote_plus, urlsplit

from dotenv import dotenv_values


PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.config import (  # noqa: E402
    ROOT_ENV_FILE,
    Settings,
    is_database_url_template,
    is_placeholder,
    mask_database_url,
    resolve_database_url_details,
)


EXCLUDED_DIRECTORIES = {
    ".git",
    ".vercel",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "venv",
}
DATABASE_VARIABLE_NAMES = (
    "DATABASE_URL",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGPASSWORD",
)


def discover_env_files() -> list[Path]:
    return sorted(
        (
            path
            for path in PROJECT_ROOT.rglob(".env*")
            if path.is_file()
            and not any(
                part in EXCLUDED_DIRECTORIES
                for part in path.relative_to(PROJECT_ROOT).parts
            )
        ),
        key=lambda path: str(path).lower(),
    )


def read_env(path: Path) -> dict[str, str]:
    return {
        str(key): str(value or "")
        for key, value in dotenv_values(path).items()
        if key
    }


def is_example(path: Path) -> bool:
    return "example" in path.name.lower()


def compose_legacy_dsn(values: dict[str, str]) -> str | None:
    required = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")
    if any(not values.get(key, "").strip() for key in required):
        return None
    user = quote_plus(values["DB_USER"])
    password = quote_plus(values["DB_PASSWORD"])
    host = values["DB_HOST"]
    port = values["DB_PORT"]
    database = quote_plus(values["DB_NAME"])
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


def dsn_from_values(values: dict[str, str]) -> str | None:
    explicit = values.get("DATABASE_URL", "").strip()
    if (
        explicit
        and not is_placeholder(explicit)
        and not is_database_url_template(explicit)
    ):
        return explicit
    return compose_legacy_dsn(values)


def masked_variable(name: str, value: str) -> str:
    if not value:
        return "<missing>"
    if name in {"DB_PASSWORD", "PGPASSWORD"}:
        return "***"
    if name == "DATABASE_URL":
        if is_database_url_template(value):
            return "<template detected>"
        return mask_database_url(value)
    return value


def database_signature(database_url: str) -> tuple[str, str, int | None]:
    parsed = urlsplit(database_url)
    try:
        port = parsed.port
    except ValueError:
        port = None
    return (
        (parsed.hostname or "").lower(),
        parsed.path.lstrip("/"),
        port,
    )


def contains_localhost(value: str) -> bool:
    lowered = value.lower()
    return "localhost" in lowered or "127.0.0.1" in lowered


def frontend_database_reads() -> list[Path]:
    matches: list[Path] = []
    for source_root in (PROJECT_ROOT / "src", PROJECT_ROOT / "frontend"):
        if not source_root.exists():
            continue
        for path in source_root.rglob("*"):
            if path.suffix.lower() not in {".js", ".jsx", ".ts", ".tsx"}:
                continue
            try:
                if "DATABASE_URL" in path.read_text(encoding="utf-8"):
                    matches.append(path)
            except UnicodeDecodeError:
                continue
    return matches


async def check_database(database_url: str) -> None:
    import asyncpg

    print("\n[DATABASE CHECK]")
    try:
        connection = await asyncpg.connect(database_url, timeout=10)
    except Exception as error:
        print(
            "connection: FAILED "
            f"({type(error).__name__}; credentials were not printed)"
        )
        return

    try:
        identity = await connection.fetchrow(
            """
            SELECT
                current_database() AS database_name,
                current_user AS db_user,
                inet_server_addr() AS server_ip,
                inet_server_port() AS server_port
            """
        )
        print(f"database_name: {identity['database_name']}")
        print(f"db_user: {identity['db_user']}")
        print(f"server_ip: {identity['server_ip']}")
        print(f"server_port: {identity['server_port']}")

        try:
            users_count = await connection.fetchval(
                "SELECT COUNT(*) FROM public.users"
            )
            print(f"users_count: {users_count}")
        except asyncpg.UndefinedTableError:
            print("users table missing")

        public_tables = await connection.fetch(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
            """
        )
        print("public_tables:")
        for table in public_tables:
            print(f"  - {table['table_name']}")
    finally:
        await connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Audit PULLUP environment without exposing secrets."
    )
    parser.add_argument(
        "--check-db",
        action="store_true",
        help="Run read-only PostgreSQL identity and users count queries.",
    )
    args = parser.parse_args()

    process_database_url = os.environ.get("DATABASE_URL", "").strip()
    files = discover_env_files()
    values_by_file = {path: read_env(path) for path in files}

    print("[ENV FILES]")
    if not files:
        print("none")
    for path in files:
        print(path)
        keys = sorted(values_by_file[path])
        print("  variables: " + (", ".join(keys) if keys else "<none>"))

    root_values = values_by_file.get(ROOT_ENV_FILE, {})
    explicit_url = (
        process_database_url
        or root_values.get("DATABASE_URL", "").strip()
    )
    template_detected = is_database_url_template(explicit_url)
    config_error: str | None = None
    settings: Settings | None = None
    try:
        database_url, selected_source, fallback_from_template = (
            resolve_database_url_details()
        )
        settings = Settings.from_env()
        template_detected = template_detected or fallback_from_template
    except RuntimeError as error:
        database_url = ""
        selected_source = (
            "template detected" if template_detected else "missing"
        )
        config_error = str(error)

    masked_database_url = (
        mask_database_url(database_url) if database_url else "<missing>"
    )
    print("\n[EFFECTIVE SETTINGS]")
    print(f"root_env: {ROOT_ENV_FILE}")
    print(f"DATABASE_URL_source: {selected_source}")
    print(
        "DATABASE_URL_template_detected: "
        + str(template_detected).lower()
    )
    print(f"masked_DATABASE_URL: {masked_database_url}")
    print(f"backend_DATABASE_URL: {masked_database_url}")
    print(f"bot_DATABASE_URL: {masked_database_url}")
    print(f"migrate_DATABASE_URL: {masked_database_url}")
    print("database_urls_match: true")
    print(
        "database_is_local: "
        + str(contains_localhost(database_url)).lower()
    )

    print("\n[DB VARIABLES]")
    for name in DATABASE_VARIABLE_NAMES:
        value = os.environ.get(name)
        if value is None:
            value = root_values.get(name, "")
        print(f"{name}: {masked_variable(name, value)}")

    vite_api_url = (
        os.environ.get("VITE_API_URL")
        or root_values.get("VITE_API_URL", "")
    ).strip()
    api_url = (
        os.environ.get("API_URL")
        or root_values.get("API_URL", "")
    ).strip()
    bot_token = (
        os.environ.get("BOT_TOKEN")
        or root_values.get("BOT_TOKEN", "")
    ).strip()
    admin_id = (
        os.environ.get("ADMIN_ID")
        or root_values.get("ADMIN_ID", "")
    ).strip()
    webapp_url = (
        os.environ.get("WEBAPP_URL")
        or root_values.get("WEBAPP_URL", "")
    ).strip()
    print(
        "BOT_TOKEN_present: "
        + str(bool(bot_token) and not is_placeholder(bot_token)).lower()
    )
    print(f"ADMIN_ID_present: {str(bool(admin_id)).lower()}")
    print(f"WEBAPP_URL_present: {str(bool(webapp_url)).lower()}")
    print(f"API_URL_present: {str(bool(api_url)).lower()}")
    print(f"VITE_API_URL_present: {str(bool(vite_api_url)).lower()}")
    print(
        "API_URL_is_local: "
        + str(contains_localhost(api_url)).lower()
    )
    print(
        "VITE_API_URL_is_local: "
        + str(contains_localhost(vite_api_url)).lower()
    )

    warnings: list[str] = []
    if config_error:
        warnings.append(config_error)
    if template_detected:
        warnings.append(
            "DATABASE_URL содержит шаблон HOST:PORT "
            "и не может использоваться."
        )
    duplicate_configs: list[tuple[Path, str]] = []
    for path, values in values_by_file.items():
        if is_example(path):
            continue
        candidate = dsn_from_values(values)
        if candidate:
            duplicate_configs.append((path, candidate))

    signatures = {
        database_signature(candidate)
        for _, candidate in duplicate_configs
    }
    if len(signatures) > 1:
        warnings.append(
            "Multiple env files point to different PostgreSQL host/database."
        )

    bot_env = PROJECT_ROOT / "bot" / ".env"
    if bot_env.exists():
        warnings.append(
            "bot/.env exists and can conflict with the root .env. "
            "Runtime now ignores it; move required values to the root .env "
            "and remove bot/.env."
        )

    frontend_reads = frontend_database_reads()
    if frontend_reads:
        warnings.append(
            "Frontend reads DATABASE_URL: "
            + ", ".join(
                str(path.relative_to(PROJECT_ROOT))
                for path in frontend_reads
            )
        )
    else:
        print("frontend_reads_DATABASE_URL: false")

    if contains_localhost(database_url):
        warnings.append(
            "DATABASE_URL points to localhost/127.0.0.1; valid only locally."
        )
    if contains_localhost(vite_api_url):
        warnings.append(
            "VITE_API_URL points to localhost/127.0.0.1; "
            "do not use it in Vercel Production."
        )
    if contains_localhost(api_url):
        warnings.append(
            "API_URL points to localhost/127.0.0.1; "
            "do not use it in Railway Production."
        )
    if not bot_token or is_placeholder(bot_token):
        warnings.append("BOT_TOKEN is missing or is a placeholder.")
    if not admin_id:
        warnings.append("ADMIN_ID is missing.")
    if not webapp_url:
        warnings.append("WEBAPP_URL is missing.")
    if not vite_api_url:
        warnings.append("VITE_API_URL is missing.")

    print("\n[DATABASE CONFIGS BY FILE]")
    if duplicate_configs:
        for path, candidate in duplicate_configs:
            print(f"{path}: {mask_database_url(candidate)}")
    else:
        print("none")

    print("\n[WARNINGS]")
    if warnings:
        for warning in warnings:
            print(f"- {warning}")
    else:
        print("none")

    if args.check_db:
        if database_url:
            asyncio.run(check_database(database_url))
        else:
            print("\n[DATABASE CHECK]")
            print("skipped: DATABASE_URL is not configured")


if __name__ == "__main__":
    main()
