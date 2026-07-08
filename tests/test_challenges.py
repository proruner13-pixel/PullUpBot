import unittest
from contextlib import asynccontextmanager

from app.auth import TelegramUser
from app.repositories.challenges import list_for_user
from app.routers.achievements import get_achievements
from app.routers.challenges import get_challenges


class FakeConnection:
    def __init__(self) -> None:
        self.query = ""
        self.args: tuple[object, ...] = ()

    async def fetch(self, query: str, *args: object) -> list[dict[str, object]]:
        self.query = query
        self.args = args
        return []


class FakeRouteConnection:
    async def fetch(self, query: str, *args: object) -> list[dict[str, object]]:
        if "user_achievements" in query:
            return [
                {
                    "code": "pullups_50",
                    "title": "50 подтягиваний",
                    "icon": "🏆",
                }
            ]
        if "WITH user_totals" in query:
            return []
        return [
            {
                "exercise": "pullups",
                "progress": 50,
                "goal": 50,
                "xp": 0,
                "level": 1,
                "next_level_progress": 0,
            }
        ]


class FakeDatabase:
    @asynccontextmanager
    async def connection(self):
        yield FakeRouteConnection()


async def fake_current_user() -> TelegramUser:
    return TelegramUser(id=123456, first_name="Test")


class ChallengeRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_list_for_user_matches_current_user_challenges_schema(self) -> None:
        connection = FakeConnection()

        await list_for_user(connection, 123456)

        self.assertEqual(connection.args, (123456,))
        self.assertIn("user_challenge.progress", connection.query)
        self.assertIn("user_challenge.xp", connection.query)
        self.assertIn("user_challenge.level", connection.query)


class ChallengeRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_challenges_handler_returns_response_models(self) -> None:
        result = await get_challenges(
            telegram_user=await fake_current_user(),
            database=FakeDatabase(),
        )

        self.assertEqual(result[0].exercise, "pullups")

    async def test_achievements_handler_returns_response_models(self) -> None:
        result = await get_achievements(
            telegram_user=await fake_current_user(),
            database=FakeDatabase(),
        )

        self.assertEqual(result[0].code, "pullups_50")


if __name__ == "__main__":
    unittest.main()
