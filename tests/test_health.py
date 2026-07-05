import unittest

from fastapi import Response, status

from app.main import create_app
from app.routers.health import liveness, readiness


class FakeDatabase:
    def __init__(self, healthy: bool) -> None:
        self.healthy = healthy

    async def is_healthy(self) -> bool:
        return self.healthy


class HealthRouteTests(unittest.TestCase):
    def test_health_routes_are_registered(self) -> None:
        paths = {route.path for route in create_app().routes}
        self.assertIn("/health", paths)
        self.assertIn("/api/health", paths)
        self.assertIn("/api/health/full", paths)


class HealthHandlerTests(unittest.IsolatedAsyncioTestCase):
    async def test_liveness_does_not_require_database(self) -> None:
        result = await liveness()
        self.assertEqual(result.status, "ok")
        self.assertEqual(result.database, "not_checked")

    async def test_readiness_returns_503_when_database_is_down(self) -> None:
        response = Response()
        result = await readiness(
            response=response,
            database=FakeDatabase(healthy=False),
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(result.status, "degraded")
        self.assertEqual(result.database, "down")


if __name__ == "__main__":
    unittest.main()
