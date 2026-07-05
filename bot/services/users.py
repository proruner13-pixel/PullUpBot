from db import db_pool

async def add_tokens(user_id: int, amount: int):
    async with db_pool.acquire() as conn:
        await conn.execute("""
            UPDATE users
            SET tokens = tokens + $2
            WHERE id = $1
        """, user_id, amount)