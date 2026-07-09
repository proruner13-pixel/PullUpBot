import unittest

from app.repositories.leaderboard import list_leaderboard


class FakeConnection:
    def __init__(self) -> None:
        self.query = ""
        self.args: tuple[object, ...] = ()

    async def fetch(self, query: str, *args: object) -> list[dict[str, object]]:
        self.query = query
        self.args = args
        return []


class LeaderboardRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_leaderboard_uses_real_users_and_xp_score(self) -> None:
        connection = FakeConnection()

        await list_leaderboard(connection, limit=25)

        self.assertEqual(connection.args, (25, 0))
        self.assertIn("FROM users", connection.query)
        self.assertIn("telegram_id <> 123456789", connection.query)
        self.assertIn("total_xp", connection.query)
        self.assertIn("ROW_NUMBER() OVER", connection.query)
        self.assertIn("approved_submissions", connection.query)
        self.assertIn("approved_pullups", connection.query)
        self.assertIn("OFFSET $2", connection.query)
        self.assertNotIn("LEADERBOARD_USERS", connection.query)


if __name__ == "__main__":
    unittest.main()
