import unittest

from app.repositories.users import update_avatar


class FakeConnection:
    def __init__(self) -> None:
        self.query = ""
        self.args: tuple[object, ...] = ()

    async def fetchrow(self, query: str, *args: object) -> dict[str, object]:
        self.query = query
        self.args = args
        return {
            "telegram_id": args[0],
            "username": "athlete",
            "first_name": "Athlete",
            "last_name": None,
            "avatar_url": args[1],
            "tokens": 42,
            "xp": 120,
            "total_xp": 120,
            "level": 2,
            "next_level_progress": 20,
            "streak_days": 3,
            "ref_code": "PULLUP-1",
            "referred_by": None,
        }


class UserRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_update_avatar_does_not_overwrite_profile_fields(self) -> None:
        connection = FakeConnection()

        result = await update_avatar(
            connection,
            telegram_id=123456,
            avatar_url="https://example.com/avatar.png",
        )

        self.assertEqual(connection.args, (123456, "https://example.com/avatar.png"))
        self.assertIn("SET avatar_url = $2", connection.query)
        self.assertNotIn("username =", connection.query)
        self.assertNotIn("tokens =", connection.query)
        self.assertEqual(result["tokens"], 42)
        self.assertEqual(result["xp"], 120)
        self.assertEqual(result["level"], 2)


if __name__ == "__main__":
    unittest.main()
