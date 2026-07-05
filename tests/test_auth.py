import hashlib
import hmac
import json
import unittest
from urllib.parse import urlencode

from app.auth import validate_init_data


BOT_TOKEN = "123456789:test-token"
AUTH_DATE = 1_700_000_000


def signed_init_data(user: dict[str, object]) -> str:
    values = {
        "auth_date": str(AUTH_DATE),
        "query_id": "AAExampleQuery",
        "user": json.dumps(user, separators=(",", ":"), ensure_ascii=False),
    }
    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(values.items())
    )
    secret_key = hmac.new(
        b"WebAppData",
        BOT_TOKEN.encode(),
        hashlib.sha256,
    ).digest()
    values["hash"] = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()
    return urlencode(values)


class TelegramInitDataTests(unittest.TestCase):
    def test_valid_init_data_returns_real_telegram_user(self) -> None:
        init_data = signed_init_data(
            {
                "id": 987654321,
                "first_name": "Alena",
                "last_name": "Pavlova",
                "username": "AlenaPavlova2000",
            }
        )

        user = validate_init_data(
            init_data,
            BOT_TOKEN,
            max_age=3600,
            now=AUTH_DATE + 60,
        )

        self.assertEqual(user.id, 987654321)
        self.assertEqual(user.first_name, "Alena")
        self.assertEqual(user.last_name, "Pavlova")
        self.assertEqual(user.username, "AlenaPavlova2000")

    def test_tampered_init_data_is_rejected(self) -> None:
        init_data = signed_init_data(
            {"id": 987654321, "first_name": "Alena"}
        ).replace("Alena", "Other")

        with self.assertRaisesRegex(ValueError, "signature"):
            validate_init_data(
                init_data,
                BOT_TOKEN,
                max_age=3600,
                now=AUTH_DATE + 60,
            )

    def test_expired_init_data_is_rejected(self) -> None:
        init_data = signed_init_data(
            {"id": 987654321, "first_name": "Alena"}
        )

        with self.assertRaisesRegex(ValueError, "expired"):
            validate_init_data(
                init_data,
                BOT_TOKEN,
                max_age=3600,
                now=AUTH_DATE + 3601,
            )


if __name__ == "__main__":
    unittest.main()
