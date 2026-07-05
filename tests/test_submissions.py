import unittest

from pydantic import ValidationError

from app.main import create_app
from app.repositories.submissions import create_submission, list_submissions
from app.schemas import SubmissionCreateRequest


class FakeConnection:
    def __init__(self) -> None:
        self.query = ""
        self.args: tuple[object, ...] = ()

    async def fetchrow(self, query: str, *args: object) -> dict[str, object]:
        self.query = query
        self.args = args
        return {"id": 1}

    async def fetch(self, query: str, *args: object) -> list[dict[str, object]]:
        self.query = query
        self.args = args
        return []


class SubmissionSchemaTests(unittest.TestCase):
    def test_video_source_is_required(self) -> None:
        with self.assertRaises(ValidationError):
            SubmissionCreateRequest(type="pullups", value=10)

    def test_supported_submission_is_valid(self) -> None:
        payload = SubmissionCreateRequest(
            type="running",
            value=5,
            video_url="https://example.com/video.mp4",
        )
        self.assertEqual(payload.type, "running")

    def test_invalid_video_url_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            SubmissionCreateRequest(
                type="pullups",
                value=10,
                video_url="javascript:alert(1)",
            )


class SubmissionRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_uses_authenticated_telegram_id(self) -> None:
        connection = FakeConnection()

        await create_submission(
            connection,
            telegram_id=123456,
            submission_type="pullups",
            value=12,
            video_file_id="telegram-file",
            video_url=None,
        )

        self.assertEqual(connection.args[0], 123456)
        self.assertIn("INSERT INTO submissions", connection.query)

    async def test_list_is_scoped_to_authenticated_user(self) -> None:
        connection = FakeConnection()

        await list_submissions(
            connection,
            telegram_id=987654,
            limit=25,
            offset=0,
        )

        self.assertEqual(connection.args, (987654, 25, 0))
        self.assertIn("WHERE user_id = $1", connection.query)


class SubmissionRouteTests(unittest.TestCase):
    def test_submission_routes_are_registered(self) -> None:
        routes = {
            (route.path, method)
            for route in create_app().routes
            for method in getattr(route, "methods", set())
        }
        self.assertIn(("/submissions", "POST"), routes)
        self.assertIn(("/submissions", "GET"), routes)


if __name__ == "__main__":
    unittest.main()
