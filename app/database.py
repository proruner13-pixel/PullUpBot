from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg


class Database:
    """Owns the application's async PostgreSQL connection pool."""

    def __init__(self, dsn: str, min_pool_size: int = 1, max_pool_size: int = 5):
        self._dsn = dsn
        self._min_pool_size = min_pool_size
        self._max_pool_size = max_pool_size
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        if self._pool is not None:
            return

        self._pool = await asyncpg.create_pool(
            dsn=self._dsn,
            min_size=self._min_pool_size,
            max_size=self._max_pool_size,
        )

    async def close(self) -> None:
        if self._pool is None:
            return

        await self._pool.close()
        self._pool = None

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[asyncpg.Connection]:
        if self._pool is None:
            raise RuntimeError("Database pool is not initialized")

        async with self._pool.acquire() as connection:
            yield connection

    async def is_healthy(self) -> bool:
        try:
            async with self.connection() as connection:
                return await connection.fetchval("SELECT 1") == 1
        except (asyncpg.PostgresError, RuntimeError):
            return False
