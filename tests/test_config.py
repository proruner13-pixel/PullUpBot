import unittest
from unittest.mock import patch

from app.config import (
    PROJECT_ROOT,
    ROOT_ENV_FILE,
    Settings,
    is_database_url_template,
    mask_database_url,
    resolve_database_url_details,
)


class ConfigTests(unittest.TestCase):
    def test_root_env_path_does_not_depend_on_working_directory(self) -> None:
        self.assertEqual(ROOT_ENV_FILE, PROJECT_ROOT / ".env")

    def test_database_password_and_query_are_masked(self) -> None:
        masked = mask_database_url(
            "postgresql://pullup:very-secret@db.example:5432/pullup"
            "?sslmode=require&token=hidden"
        )
        self.assertEqual(
            masked,
            "postgresql://pullup:***@db.example:5432/pullup",
        )
        self.assertNotIn("very-secret", masked)
        self.assertNotIn("token", masked)

    def test_process_database_url_has_priority(self) -> None:
        expected = "postgresql://runtime:secret@railway.internal:5432/pullup"
        with patch.dict(
            "os.environ",
            {
                "APP_ENV": "production",
                "DATABASE_URL": expected,
                "BOT_TOKEN": "123456:valid-token-value",
                "WEBAPP_URL": "https://pullupbot.vercel.app",
                "CORS_ORIGINS": "https://pullupbot.vercel.app",
            },
            clear=False,
        ):
            settings = Settings.from_env()
        self.assertEqual(settings.database_dsn, expected)

    def test_production_rejects_localhost_database(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "APP_ENV": "production",
                "DATABASE_URL": (
                    "postgresql://postgres:secret@localhost:5432/pullup"
                ),
                "BOT_TOKEN": "123456:valid-token-value",
                "WEBAPP_URL": "https://pullupbot.vercel.app",
                "CORS_ORIGINS": "https://pullupbot.vercel.app",
            },
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "localhost"):
                Settings.from_env()

    def test_production_rejects_invalid_database_url(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "APP_ENV": "production",
                "DATABASE_URL": "not-a-postgresql-url",
                "BOT_TOKEN": "123456:valid-token-value",
                "WEBAPP_URL": "https://pullupbot.vercel.app",
                "CORS_ORIGINS": "https://pullupbot.vercel.app",
            },
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "PostgreSQL URL"):
                Settings.from_env()

    def test_cors_origin_trailing_slash_is_removed(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "APP_ENV": "development",
                "CORS_ORIGINS": "https://pullupbot.vercel.app/",
            },
            clear=False,
        ):
            settings = Settings.from_env()
        self.assertEqual(
            settings.cors_origins,
            ("https://pullupbot.vercel.app",),
        )

    def test_template_database_url_falls_back_to_complete_db_fields(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "DATABASE_URL": (
                    "postgresql://USER:PASSWORD@HOST:PORT/DBNAME"
                ),
                "DB_HOST": "localhost",
                "DB_PORT": "5433",
                "DB_NAME": "pullup",
                "DB_USER": "postgres",
                "DB_PASSWORD": "p@ ss",
            },
            clear=False,
        ):
            database_url, source, template_detected = (
                resolve_database_url_details()
            )
        self.assertEqual(
            database_url,
            "postgresql://postgres:p%40+ss@localhost:5433/pullup",
        )
        self.assertEqual(source, "built from DB_*")
        self.assertTrue(template_detected)

    def test_template_with_incomplete_db_fields_has_clear_error(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "DATABASE_URL": (
                    "postgresql://USER:PASSWORD@HOST:PORT/DBNAME"
                ),
                "DB_HOST": "localhost",
                "DB_PORT": "5433",
                "DB_NAME": "pullup",
                "DB_USER": "postgres",
                "DB_PASSWORD": "your_password",
            },
            clear=False,
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "DATABASE_URL не настроен: найден шаблон",
            ):
                resolve_database_url_details()

    def test_database_url_template_is_detected(self) -> None:
        self.assertTrue(
            is_database_url_template(
                "postgresql://USER:PASSWORD@HOST:PORT/DBNAME"
            )
        )


if __name__ == "__main__":
    unittest.main()
