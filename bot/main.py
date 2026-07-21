# bot/main.py
import os
import random

import asyncio
import logging
import secrets
import tempfile
from pathlib import Path
from typing import Optional, Dict
from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    Message, CallbackQuery,
    InlineKeyboardMarkup, InlineKeyboardButton, ForceReply,
    BotCommand, BotCommandScopeDefault, BotCommandScopeChat, User, FSInputFile,
    MenuButtonWebApp,
)
import aiohttp
import asyncpg
from aiogram.types import WebAppInfo
from dotenv import load_dotenv
from app.services.rewards import apply_workout_rewards


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("pullup.bot")


class WebappVideoDownloadError(Exception):
    """Raised when a WebApp video cannot be downloaded for moderation."""


async def download_webapp_video(video_url: Optional[str], pullup_id: int) -> str:
    if not video_url:
        raise WebappVideoDownloadError("video_url is empty")

    timeout = aiohttp.ClientTimeout(total=90)
    temp_path: str | None = None

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(video_url, allow_redirects=True) as response:
                content_type = (
                    response.headers.get("Content-Type", "")
                    .split(";", 1)[0]
                    .strip()
                    .lower()
                )
                logger.info(
                    "PENDING_WEBAPP_VIDEO_HTTP pullup_id=%s status=%s content_type=%s final_url=%s",
                    pullup_id,
                    response.status,
                    content_type or "<empty>",
                    response.url,
                )

                if response.status != 200:
                    raise WebappVideoDownloadError(
                        f"video_url returned HTTP {response.status}"
                    )
                if not (
                    content_type.startswith("video/")
                    or content_type == "application/octet-stream"
                ):
                    raise WebappVideoDownloadError(
                        f"unsupported content-type: {content_type or '<empty>'}"
                    )

                with tempfile.NamedTemporaryFile(
                    prefix=f"pullup-{pullup_id}-",
                    suffix=".mp4",
                    delete=False,
                ) as temp_file:
                    temp_path = temp_file.name
                    async for chunk in response.content.iter_chunked(1024 * 1024):
                        temp_file.write(chunk)

        if temp_path is None or Path(temp_path).stat().st_size == 0:
            raise WebappVideoDownloadError("downloaded video file is empty")
        return temp_path
    except Exception:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
        raise


# ================== Конфиг ==================
ROOT_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
BOT_TOKEN = ""
DATABASE_URL = ""
ADMIN_IDS: frozenset[int] = frozenset()
ADMIN_ID = 0  # Legacy alias for code paths that expect one moderator.
APP_ENV = "development"
WEBAPP_URL = ""
API_URL = ""
BOT_PUBLIC_URL = os.getenv("BOT_PUBLIC_URL", "https://t.me/ActiveRunBot").strip()
SUPPORT_URL = os.getenv("SUPPORT_URL", BOT_PUBLIC_URL).strip()
WEBAPP_DEEP_LINKS_ENABLED = (
    os.getenv("WEBAPP_DEEP_LINKS_ENABLED", "false").lower() == "true"
)

def load_bot_config() -> None:
    """Load and validate worker configuration without overriding Render env."""
    global BOT_TOKEN, DATABASE_URL, ADMIN_IDS, ADMIN_ID
    global APP_ENV, WEBAPP_URL, API_URL

    load_dotenv(ROOT_ENV_FILE, override=False)
    BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
    DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
    APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
    WEBAPP_URL = os.getenv("WEBAPP_URL", "").strip().rstrip("/")
    API_URL = os.getenv("API_URL", "").strip().rstrip("/")

    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN environment variable is required")
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is required")

    raw_admin_ids = os.getenv("ADMIN_IDS", "").strip()
    if not raw_admin_ids:
        raw_admin_ids = os.getenv("ADMIN_ID", "").strip()
    try:
        ADMIN_IDS = frozenset(
            int(value.strip())
            for value in raw_admin_ids.split(",")
            if value.strip()
        )
    except ValueError as exc:
        raise RuntimeError(
            "ADMIN_IDS must be a comma-separated list of Telegram user IDs"
        ) from exc
    ADMIN_ID = next(iter(ADMIN_IDS), 0)

    if not WEBAPP_URL:
        if APP_ENV == "production":
            raise RuntimeError("WEBAPP_URL environment variable is required")
        WEBAPP_URL = "https://pullupbot.vercel.app"


# Runtime resources are initialized once in main(), not during module import.
bot: Optional[Bot] = None
dp = Dispatcher()
db_pool: Optional[asyncpg.Pool] = None
# ================== Схема БД (автосоздание) ==================
CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    display_name TEXT,
    tokens INT NOT NULL DEFAULT 0,
    xp INT NOT NULL DEFAULT 0,
    total_xp INT NOT NULL DEFAULT 0,
    level INT NOT NULL DEFAULT 1,
    weekly_goal INT NOT NULL DEFAULT 0,
    ref_code TEXT UNIQUE,
    referred_by INT REFERENCES users(id) ON DELETE SET NULL,
    referrals_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pullups (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_file_id TEXT,
    file_path TEXT,
    file_url TEXT,
    source TEXT NOT NULL DEFAULT 'telegram',
    caption TEXT,
    count INT,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
    moderator_id BIGINT,
    reject_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    moderated_at TIMESTAMPTZ,
    rewards_applied BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS challenges (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    goal INTEGER NOT NULL CHECK (goal > 0),
    reward_tokens INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_challenges (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    progress INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS token_transactions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    source_type TEXT,
    source_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pullups_status ON pullups(status);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
"""

# На всякий случай "мягко" добавим недостающие колонки (если будем расширять)
ALTERS = [
    ("users", "display_name", "TEXT"),
    ("users", "xp", "INT NOT NULL DEFAULT 0"),
    ("users", "total_xp", "INT NOT NULL DEFAULT 0"),
    ("users", "level", "INT NOT NULL DEFAULT 1"),
    ("users", "ref_code", "TEXT UNIQUE"),
    ("users", "referred_by", "INT REFERENCES users(id) ON DELETE SET NULL"),
    ("users", "referrals_count", "INT NOT NULL DEFAULT 0"),
    ("pullups", "file_path", "TEXT"),
    ("pullups", "file_url", "TEXT"),
    ("pullups", "source", "TEXT NOT NULL DEFAULT 'telegram'"),
    ("pullups", "rewards_applied", "BOOLEAN NOT NULL DEFAULT FALSE"),
]

async def init_db_pool() -> asyncpg.Pool:
    return await asyncpg.create_pool(
        dsn=DATABASE_URL,
        min_size=1,
        max_size=5,
    )

async def ensure_schema():
    async with db_pool.acquire() as conn:
        await conn.execute(CREATE_TABLES_SQL)
        await conn.execute(
            """
            INSERT INTO challenges (slug, title, type, goal)
            VALUES
                ('pullups', 'Подтягивания', 'strength', 50),
                ('pushups', 'Отжимания', 'strength', 150),
                ('plank', 'Планка', 'endurance', 5),
                ('running', 'Бег', 'cardio', 10)
            ON CONFLICT (slug) DO NOTHING
            """
        )
        await conn.execute("ALTER TABLE pullups ALTER COLUMN video_file_id DROP NOT NULL")
        for table, column, ddl in ALTERS:
            try:
                await conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
            except asyncpg.DuplicateColumnError:
                pass
        await conn.execute(
            """
            UPDATE users
            SET xp = total_xp
            WHERE xp = 0 AND total_xp <> 0
            """
        )
        await conn.execute(
            """
            UPDATE users
            SET total_xp = xp
            WHERE total_xp = 0 AND xp <> 0
            """
        )
        await conn.execute(
            """
            ALTER TABLE user_challenges
                ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS xp_transactions (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                challenge_key TEXT NOT NULL,
                xp_amount INTEGER NOT NULL,
                source_type TEXT NOT NULL,
                source_id INTEGER,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
            """
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_xp_transactions_reward_source
                ON xp_transactions (source_type, source_id)
                WHERE source_id IS NOT NULL
            """
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_token_transactions_reward_source
                ON token_transactions (source_type, source_id)
                WHERE source_id IS NOT NULL
                  AND source_type IN ('submission', 'pullup')
            """
        )

# ================== Хелперы ==================
def webapp_url(screen: Optional[str] = None) -> str:
    """Central place for future Mini App deep links."""
    if screen and WEBAPP_DEEP_LINKS_ENABLED:
        separator = "&" if "?" in WEBAPP_URL else "?"
        return f"{WEBAPP_URL}{separator}screen={screen}"
    return WEBAPP_URL


def app_button(
    text: str = "Открыть PULLUP",
    screen: Optional[str] = None,
) -> InlineKeyboardButton:
    return InlineKeyboardButton(
        text=text,
        web_app=WebAppInfo(url=webapp_url(screen)),
    )


def app_keyboard(
    text: str = "Открыть PULLUP",
    screen: Optional[str] = None,
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[app_button(text=text, screen=screen)]]
    )


def start_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [app_button()],
            [
                InlineKeyboardButton(
                    text="Как это работает",
                    callback_data="user:help",
                ),
                InlineKeyboardButton(
                    text="Отправить видео",
                    callback_data="user:submit",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="Поддержка",
                    callback_data="user:support",
                )
            ],
        ]
    )


USER_COMMANDS = [
    BotCommand(command="start", description="Запустить PULLUP"),
    BotCommand(command="app", description="Открыть приложение"),
    BotCommand(command="help", description="Как это работает"),
    BotCommand(command="submit", description="Отправить видео"),
    BotCommand(command="profile", description="Мой профиль"),
    BotCommand(command="rating", description="Рейтинг"),
    BotCommand(command="referral", description="Реферальная программа"),
    BotCommand(command="support", description="Поддержка"),
]

WEBAPP_MENU_BUTTON_TEXT = "\u041e\u0442\u043a\u0440\u044b\u0442\u044c PULLUP"


async def configure_webapp_menu_button(chat_id: int | None = None) -> None:
    await bot.set_chat_menu_button(
        chat_id=chat_id,
        menu_button=MenuButtonWebApp(
            text=WEBAPP_MENU_BUTTON_TEXT,
            web_app=WebAppInfo(url=WEBAPP_URL),
        ),
    )


def moderation_kb(pullup_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text="▶ Посмотреть", callback_data=f"view:{pullup_id}"),
            InlineKeyboardButton(text="✅ Одобрить", callback_data=f"approve:{pullup_id}"),
            InlineKeyboardButton(text="❌ Отклонить", callback_data=f"reject:{pullup_id}")
        ]]
    )

def next_back_kb(prev_id: Optional[int], next_id: Optional[int]) -> InlineKeyboardMarkup:
    row = []
    if prev_id:
        row.append(InlineKeyboardButton(text="⬅ Предыдущее", callback_data=f"open:{prev_id}"))
    if next_id:
        row.append(InlineKeyboardButton(text="Следующее ➡", callback_data=f"open:{next_id}"))
    return InlineKeyboardMarkup(inline_keyboard=[row] if row else [[]])

def gen_ref_code() -> str:
    # короткий реф-код
    return secrets.token_urlsafe(6).replace("_", "A").replace("-", "B")

# ================== DB-утилиты ==================
async def ensure_user(
    telegram_id: int,
    username: Optional[str],
    display_name: Optional[str] = None,
) -> int:
    """Создаём пользователя, если нет. Гарантируем ref_code."""
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("SELECT id, ref_code FROM users WHERE telegram_id=$1", telegram_id)
            if row is None:
                code = gen_ref_code()
                user_id = await conn.fetchval("""
                    INSERT INTO users (telegram_id, username, display_name, ref_code)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id
                """, telegram_id, username, display_name, code)
            else:
                # подчищаем username/имя при необходимости
                await conn.execute("""
                    UPDATE users SET username=$2, display_name=COALESCE(display_name, $3)
                    WHERE telegram_id=$1
                """, telegram_id, username, display_name)
                user_id = row["id"]

            logger.info(
                "USER_FOUND_OR_CREATED telegram_id=%s user_id=%s username=%s",
                telegram_id,
                user_id,
                username or "",
            )
            return user_id

async def set_display_name(telegram_id: int, name: str):
    async with db_pool.acquire() as conn:
        await conn.execute("UPDATE users SET display_name=$2 WHERE telegram_id=$1", telegram_id, name)

async def get_user_id(telegram_id: int) -> Optional[int]:
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT id FROM users WHERE telegram_id=$1", telegram_id)
        return row["id"] if row else None

async def get_tokens(telegram_id: int) -> int:
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT tokens FROM users WHERE telegram_id=$1", telegram_id)
        return row["tokens"] if row else 0


async def get_profile_summary(telegram_id: int):
    async with db_pool.acquire() as conn:
        return await conn.fetchrow(
            """
            SELECT display_name, username, tokens, level, streak_days
            FROM users
            WHERE telegram_id=$1
            """,
            telegram_id,
        )


async def get_submission_summary(telegram_id: int):
    async with db_pool.acquire() as conn:
        return await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE p.status='pending') AS pending,
                COUNT(*) FILTER (WHERE p.status='approved') AS approved,
                COUNT(*) FILTER (WHERE p.status='rejected') AS rejected
            FROM pullups p
            JOIN users u ON u.id = p.user_id
            WHERE u.telegram_id=$1
            """,
            telegram_id,
        )


async def insert_pending_video(user_id: int, file_id: str, caption: Optional[str]) -> int:
    async with db_pool.acquire() as conn:
        pullup_id = await conn.fetchval("""
            INSERT INTO pullups (
                user_id,
                video_file_id,
                source,
                caption,
                count,
                status,
                created_at
            )
            VALUES ($1, $2, 'telegram', $3, NULL, 'pending', NOW())
            RETURNING id
        """, user_id, file_id, caption)
        logger.info("PULLUP_INSERTED pullup_id=%s user_id=%s", pullup_id, user_id)
        return pullup_id

async def list_pending_ids(limit: int = 50) -> list[int]:
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id FROM pullups WHERE status='pending' ORDER BY created_at ASC LIMIT $1
        """, limit)
        return [r["id"] for r in rows]

async def get_pullup(pullup_id: int):
    async with db_pool.acquire() as conn:
        return await conn.fetchrow("""
            SELECT p.*, u.telegram_id, u.username, u.display_name
            FROM pullups p JOIN users u ON u.id = p.user_id
            WHERE p.id=$1
        """, pullup_id)

async def approve_video(pullup_id: int, moderator_id: int, count: int) -> Optional[int]:
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT
                    p.user_id,
                    p.status,
                    p.rewards_applied,
                    u.telegram_id
                FROM pullups AS p
                JOIN users AS u ON u.id = p.user_id
                WHERE p.id=$1
                FOR UPDATE OF p
                """,
                pullup_id,
            )
            if (
                not row
                or row["status"] != "pending"
                or row["rewards_applied"]
            ):
                return None
            
            await conn.execute("""
                UPDATE pullups
                SET status='approved',
                    count=$2,
                    moderator_id=$3,
                    moderated_at=NOW()
                WHERE id=$1
            """, pullup_id, count, moderator_id)

            await apply_workout_rewards(
                conn,
                user_id=row["user_id"],
                activity_type="pullups",
                payload={"reps": count},
                source_type="pullup",
                source_id=pullup_id,
                update_progress=False,
            )

            await conn.execute(
                """
                UPDATE pullups
                SET rewards_applied=TRUE
                WHERE id=$1
                """,
                pullup_id,
            )

            return row["telegram_id"]

async def reject_video(pullup_id: int, moderator_id: int, reason: Optional[str]) -> bool:
    async with db_pool.acquire() as conn:
        res = await conn.execute("""
            UPDATE pullups SET status='rejected', moderator_id=$2, reject_reason=$3, moderated_at=NOW()
            WHERE id=$1 AND status='pending'
        """, pullup_id, moderator_id, reason)
        return res.startswith("UPDATE 1")

async def get_or_create_ref_code(telegram_id: int) -> str:
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT id, ref_code FROM users WHERE telegram_id=$1", telegram_id)
        if row and row["ref_code"]:
            return row["ref_code"]
        
        code = gen_ref_code()
        await conn.execute("UPDATE users SET ref_code=$2 WHERE telegram_id=$1", telegram_id, code)
        return code

async def apply_referral(new_user_tid: int, payload: Optional[str]):
    """
    Если /start был с payload — пытаемся найти чьё это ref_code и проставить referred_by + +1 к referrals_count.
    """
    if not payload:
        return
    
    async with db_pool.acquire() as conn:
        ref_owner = await conn.fetchrow("SELECT id, telegram_id FROM users WHERE ref_code=$1", payload)
        me = await conn.fetchrow("SELECT id, referred_by FROM users WHERE telegram_id=$1", new_user_tid)
        
        if not ref_owner or not me or me["referred_by"]:
            return
        
        if ref_owner["telegram_id"] == new_user_tid:
            return  # сам себя не рефералим
        
        async with conn.transaction():
            await conn.execute("UPDATE users SET referred_by=$1 WHERE id=$2", ref_owner["id"], me["id"])
            await conn.execute("""
                UPDATE users SET referrals_count = referrals_count + 1 WHERE id=$1
            """, ref_owner["id"])

async def leaderboard_top(limit: int = 10):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT display_name, username, tokens FROM users
            ORDER BY tokens DESC, id ASC LIMIT $1
        """, limit)
        return rows

async def my_rank(telegram_id: int):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT pos, tokens FROM (
                SELECT id, tokens, RANK() OVER (ORDER BY tokens DESC, id ASC) AS pos
                FROM users
            ) t WHERE id = (SELECT id FROM users WHERE telegram_id=$1)
        """, telegram_id)
        return (row["pos"], row["tokens"]) if row else (None, 0)

# ================== Состояние модератора для ввода количества ==================
approve_wait: Dict[int, int] = {}  # moderator_tid -> pullup_id

# ================== Хэндлеры пользователя ==================
@dp.message(Command("start"))
async def cmd_start(message: Message, command: CommandObject):
    try:
        await configure_webapp_menu_button(message.chat.id)
    except Exception:
        logger.exception("WEBAPP_MENU_BUTTON_CHAT_FAILED chat_id=%s", message.chat.id)
    await ensure_user(message.from_user.id, message.from_user.username, message.from_user.full_name)
    await apply_referral(message.from_user.id, command.args)

    await message.answer(
        "<b>Добро пожаловать в PULLUP 💪</b>\n\n"
        "Это спортивная платформа с челленджами, достижениями, "
        "рейтингом и токенами.\n\n"
        "Выполняй задания, подтверждай тренировки, открывай ачивки "
        "и поднимайся в рейтинге.\n\n"
        "Жми кнопку ниже и открывай приложение.",
        reply_markup=start_keyboard(),
    )

@dp.message(F.reply_to_message, F.reply_to_message.text == "Введи имя/ник 👇")
async def set_name_handler(message: Message):
    name = message.text.strip()
    if len(name) < 2 or len(name) > 40:
        await message.reply("Имя должно быть от 2 до 40 символов. Попробуй снова.")
        return
    
    await set_display_name(message.from_user.id, name)
    await message.reply(
        f"Отлично, {name}! Теперь ты в рейтинге. Отправляй видео 🚀",
        reply_markup=app_keyboard(),
    )

async def send_help(message: Message):
    await message.answer(
        "<b>Как работает PULLUP</b>\n\n"
        "1. Открой приложение и выбери челлендж.\n"
        "2. Выполни тренировку.\n"
        "3. Отправь видеоподтверждение через бота или приложение.\n"
        "4. После проверки получи токены и прогресс.\n"
        "5. Открывай достижения и поднимайся в рейтинге.\n\n"
        "Основной прогресс, профиль и рейтинг находятся в Mini App.",
        reply_markup=app_keyboard(),
    )


async def send_submit(message: Message, actor: Optional[User] = None):
    user = actor or message.from_user
    await ensure_user(
        user.id,
        user.username,
        user.full_name,
    )
    summary = await get_submission_summary(user.id)
    status_text = ""
    if summary:
        status_text = (
            "\n\n<b>Твои заявки:</b>\n"
            f"На проверке: {summary['pending']}\n"
            f"Одобрено: {summary['approved']}\n"
            f"Отклонено: {summary['rejected']}"
        )
    await message.answer(
        "<b>Видеоподтверждение</b>\n\n"
        "Пришли видео в этот чат одним сообщением. "
        "В подписи укажи упражнение и результат.\n\n"
        "После отправки видео попадёт в очередь модерации."
        f"{status_text}",
        reply_markup=app_keyboard(
            text="Открыть PULLUP",
            screen="submit",
        ),
    )


async def send_support(message: Message):
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [app_button()],
            [
                InlineKeyboardButton(
                    text="Написать в поддержку",
                    url=SUPPORT_URL,
                )
            ],
        ]
    )
    await message.answer(
        "<b>Поддержка PULLUP</b>\n\n"
        "Опиши проблему одним сообщением: что произошло и на каком шаге. "
        "Если можешь, приложи скриншот.",
        reply_markup=keyboard,
    )


@dp.message(Command("help"))
@dp.message(F.text == "Помощь")
async def cmd_help(message: Message):
    await send_help(message)


@dp.message(Command("app"))
async def cmd_app(message: Message):
    try:
        await configure_webapp_menu_button(message.chat.id)
    except Exception:
        logger.exception("WEBAPP_MENU_BUTTON_CHAT_FAILED chat_id=%s", message.chat.id)
    await message.answer(
        "Твой прогресс, челленджи и достижения — в приложении.",
        reply_markup=app_keyboard(),
    )


@dp.message(Command("submit"))
async def cmd_submit(message: Message):
    await send_submit(message)


@dp.message(Command("support"))
async def cmd_support(message: Message):
    await send_support(message)


@dp.callback_query(F.data == "user:help")
async def cb_user_help(query: CallbackQuery):
    await send_help(query.message)
    await query.answer()


@dp.callback_query(F.data == "user:submit")
async def cb_user_submit(query: CallbackQuery):
    await send_submit(query.message, query.from_user)
    await query.answer()


@dp.callback_query(F.data == "user:support")
async def cb_user_support(query: CallbackQuery):
    await send_support(query.message)
    await query.answer()

@dp.message(Command("tokens"))
@dp.message(F.text == "💰 Баланс")
async def cmd_tokens(message: Message):
    await ensure_user(
        message.from_user.id,
        message.from_user.username,
        message.from_user.full_name,
    )
    tokens = await get_tokens(message.from_user.id)
    await message.answer(
        f"<b>Баланс: {tokens} PULLUP</b>\n\n"
        "История наград и полный прогресс доступны в приложении.",
        reply_markup=app_keyboard(text="Открыть баланс"),
    )


@dp.message(Command("profile"))
async def cmd_profile(message: Message):
    await ensure_user(
        message.from_user.id,
        message.from_user.username,
        message.from_user.full_name,
    )
    profile = await get_profile_summary(message.from_user.id)
    if not profile:
        await message.answer(
            "Профиль пока не найден.",
            reply_markup=app_keyboard(
                text="Открыть профиль",
                screen="profile",
            ),
        )
        return

    name = profile["display_name"] or (
        f"@{profile['username']}" if profile["username"] else "Спортсмен PULLUP"
    )
    await message.answer(
        f"<b>{name}</b>\n"
        f"Уровень: {profile['level']}\n"
        f"Токены: {profile['tokens']} PULLUP\n"
        f"Серия: {profile['streak_days']} дней",
        reply_markup=app_keyboard(
            text="Открыть профиль",
            screen="profile",
        ),
    )


@dp.message(Command("rating"))
async def cmd_rating(message: Message):
    await ensure_user(
        message.from_user.id,
        message.from_user.username,
        message.from_user.full_name,
    )
    position, tokens = await my_rank(message.from_user.id)
    position_text = (
        f"Твоя текущая позиция: <b>#{position}</b>\n"
        if position is not None
        else "Позиция появится после первой подтверждённой активности.\n"
    )
    await message.answer(
        "<b>Рейтинг PULLUP</b>\n\n"
        f"{position_text}"
        f"Баланс: <b>{tokens} PULLUP</b>\n\n"
        "Полная таблица лидеров доступна в приложении.",
        reply_markup=app_keyboard(
            text="Открыть рейтинг",
            screen="rating",
        ),
    )


# Legacy: команда скрыта из меню и ведёт в актуальный экран Mini App.
@dp.message(Command("leaderboard"))
@dp.message(F.text == "🏆 Лидеры")
async def cmd_leaderboard(message: Message):
    await message.answer(
        "Таблица лидеров переехала в приложение.",
        reply_markup=app_keyboard(
            text="Открыть рейтинг",
            screen="rating",
        ),
    )


# Legacy alias для /rating.
@dp.message(Command("rank"))
@dp.message(F.text == "📊 Мой рейтинг")
async def cmd_rank(message: Message):
    await cmd_rating(message)

@dp.message(Command("referral"))
@dp.message(F.text == "🎯 Реферал")
async def cmd_referral(message: Message):
    await ensure_user(
        message.from_user.id,
        message.from_user.username,
        message.from_user.full_name,
    )
    code = await get_or_create_ref_code(message.from_user.id)
    text = (
        "<b>Твой реферальный код:</b> <code>{code}</code>\n\n"
        "Дай другу ссылку:\n"
        f"<code>https://t.me/{(await bot.me()).username}?start={code}</code>\n\n"
        "Когда друг зайдёт по ссылке и начнёт тренироваться — ты попадёшь в реф-таблицу."
    ).format(code=code)
    
    # Плюс покажем статистику:
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT referrals_count FROM users WHERE telegram_id=$1", message.from_user.id)
        text += f"\n\nПриведено друзей: <b>{row['referrals_count'] if row else 0}</b>"
    
    await message.answer(
        text,
        reply_markup=app_keyboard(
            text="Открыть реферальную программу",
            screen="referral",
        ),
    )

# ====== Legacy: дуэли скрыты из пользовательского меню ======
@dp.message(F.text == "⚔️ Дуэль")
@dp.message(Command("duel"))
async def cmd_duel(message: Message):
    await message.answer(
        "Дуэли временно недоступны. Актуальные челленджи находятся в PULLUP.",
        reply_markup=app_keyboard(),
    )

@dp.message(Command("myduel"))
async def cmd_myduel(message: Message):
    await message.answer(
        "Раздел дуэлей скрыт до обновления. Открой текущие челленджи в приложении.",
        reply_markup=app_keyboard(),
    )

# ====== Ежедневный мотиватор ======
QUOTES = [
    "Сегодня идеальный день для того, чтобы подтянуться хотя бы раз 💪",
    "Ты становишься сильнее каждый день, когда не сдаёшься 🏋️",
    "100 подтягиваний начинаются с одного 😉",
]

async def daily_motivation():
    while True:
        async with db_pool.acquire() as conn:
            users = await conn.fetch("SELECT telegram_id FROM users")
            for u in users:
                try:
                    await bot.send_message(u["telegram_id"], random.choice(QUOTES))
                except Exception as e:
                    print(f"[!] Не удалось отправить сообщение {u['telegram_id']}: {e}")
        await asyncio.sleep(24 * 60 * 60)  # раз в сутки

# Приём видео
@dp.message(
    F.video
    | F.text.in_(["Отправить видео", "📤 Отправить видео"])
)
async def handle_video(message: Message):
    if not message.video:
        await send_submit(message)
        return

    try:
        logger.info(
            "VIDEO_RECEIVED telegram_id=%s video_file_id=%s caption=%r",
            message.from_user.id,
            message.video.file_id,
            message.caption,
        )
        uid = await ensure_user(
            message.from_user.id,
            message.from_user.username,
            message.from_user.full_name,
        )

        pullup_id = await insert_pending_video(uid, message.video.file_id, message.caption)
        await message.answer(
            "<b>Видео принято</b>\n\n"
            f"Заявка #{pullup_id} отправлена на модерацию. "
            "Статус можно проверить командой /submit.",
            reply_markup=app_keyboard(),
        )
    except Exception:
        logger.exception(
            "VIDEO_PROCESSING_FAILED telegram_id=%s video_file_id=%s",
            message.from_user.id,
            message.video.file_id,
        )
        await message.answer(
            "Не удалось сохранить видео. Попробуй отправить его ещё раз чуть позже."
        )

# ================== Админ (модерация) ==================
def is_admin(message: Message) -> bool:
    return message.from_user.id in ADMIN_IDS

@dp.message(Command("pending"))
async def cmd_pending(message: Message):
    if not is_admin(message):
        return await message.answer("Эта команда доступна только администратору.")

    try:
        ids = await list_pending_ids(1)
        logger.info(
            "PENDING_REQUESTED telegram_id=%s pending_count=%s",
            message.from_user.id,
            len(ids),
        )
        if not ids:
            logger.info("PENDING_EMPTY telegram_id=%s", message.from_user.id)
            return await message.answer("Очередь пуста. Нет видео в статусе <i>pending</i>.")

        first = ids[0]
        await open_item(message.chat.id, first, ids)
    except Exception:
        logger.exception("PENDING_FAILED telegram_id=%s", message.from_user.id)
        await message.answer("Не удалось загрузить очередь. Попробуй ещё раз позже.")

async def open_item(chat_id: int, pullup_id: int, queue_ids: list[int]):
    row = await get_pullup(pullup_id)
    if not row:
        await bot.send_message(chat_id, f"Запись {pullup_id} не найдена.")
        return

    row_data = dict(row)
    source = row_data.get("source") or "telegram"
    video_file_id = row_data.get("video_file_id")
    video_url = row_data.get("file_url") or row_data.get("video_url")
    file_path = row_data.get("file_path")

    logger.info(
        "PENDING_FOUND pullup_id=%s source=%s user_id=%s",
        pullup_id,
        source,
        row_data.get("user_id"),
    )
    username = row_data.get("username")
    uname = row_data.get("display_name") or (
        ("@" + username) if username else f"id{row_data.get('telegram_id')}"
    )
    caption = (
        f"<b>На модерации #{pullup_id}</b>\n"
        f"От: {uname}\n"
        f"User ID: {row_data.get('user_id')}\n"
        f"Статус: {row_data.get('status')}\n\n"
        f"Источник: {source}\n"
        f"Создано: {row_data.get('created_at')}\n\n"
        f"{row_data.get('caption') or ''}"
    ).strip()

    logger.info(
        "PENDING_VIDEO_DEBUG pullup_id=%s source=%s video_file_id=%s video_url=%s",
        pullup_id,
        source,
        video_file_id,
        video_url,
    )
    if source == "webapp":
        logger.info("PENDING_SOURCE_WEBAPP pullup_id=%s", pullup_id)
        temp_video_path: str | None = None
        try:
            if video_url:
                temp_video_path = await download_webapp_video(video_url, pullup_id)
                video = FSInputFile(temp_video_path)
            elif file_path and os.path.exists(file_path):
                video = FSInputFile(file_path)
            else:
                raise WebappVideoDownloadError("video_url and file_path are empty")

            await bot.send_video(
                chat_id,
                video,
                caption=caption,
                reply_markup=moderation_kb(pullup_id),
            )
        except Exception:
            logger.exception(
                "PENDING_WEBAPP_VIDEO_FAILED pullup_id=%s video_url=%s file_path=%s",
                pullup_id,
                video_url,
                file_path,
            )
            await bot.send_message(
                chat_id,
                f"{caption}\n\n"
                "Не удалось загрузить видео из WebApp. Проверь video_url и storage.",
                reply_markup=moderation_kb(pullup_id),
            )
        finally:
            if temp_video_path:
                Path(temp_video_path).unlink(missing_ok=True)
    else:
        logger.info("PENDING_SOURCE_TELEGRAM pullup_id=%s", pullup_id)
        if not video_file_id:
            raise WebappVideoDownloadError("telegram video_file_id is empty")
        await bot.send_video(
            chat_id,
            video_file_id,
            caption=caption,
            reply_markup=moderation_kb(pullup_id),
        )
    logger.info("PENDING_SENT_TO_MODERATOR pullup_id=%s chat_id=%s", pullup_id, chat_id)
    
    # Кнопки навигации (по желанию)
    try:
        idx = queue_ids.index(pullup_id)
        prev_id = queue_ids[idx - 1] if idx > 0 else None
        next_id = queue_ids[idx + 1] if idx + 1 < len(queue_ids) else None
        
        if prev_id or next_id:
            await bot.send_message(chat_id, "Навигация по очереди:", reply_markup=next_back_kb(prev_id, next_id))
    except ValueError:
        pass

@dp.callback_query(F.data.startswith("open:"))
async def cb_open(query: CallbackQuery):
    if query.from_user.id not in ADMIN_IDS:
        return await query.answer("Только для модератора", show_alert=True)
    
    pullup_id = int(query.data.split(":")[1])
    ids = await list_pending_ids(50)
    await open_item(query.message.chat.id, pullup_id, ids)
    await query.answer()

@dp.callback_query(F.data.startswith("view:"))
async def cb_view(query: CallbackQuery):
    if query.from_user.id not in ADMIN_IDS:
        return await query.answer("Только для модератора", show_alert=True)
    
    pullup_id = int(query.data.split(":")[1])
    row = await get_pullup(pullup_id)
    if not row:
        await query.answer("Не найдено", show_alert=True)
        return

    row_data = dict(row)
    video_file_id = row_data.get("video_file_id")
    video_url = row_data.get("file_url") or row_data.get("video_url")
    caption = f"Видео #{pullup_id}\n{row_data.get('caption') or ''}"

    if video_file_id:
        try:
            await query.message.answer_video(video_file_id, caption=caption)
            await query.answer("Отправил видео ещё раз")
        except Exception:
            logger.exception("VIEW_TELEGRAM_VIDEO_FAILED pullup_id=%s", pullup_id)
            await query.answer("Не удалось отправить видео", show_alert=True)
        return

    if not video_url:
        await query.message.answer("У заявки нет видео")
        await query.answer("У заявки нет видео", show_alert=True)
        return

    temp_video_path: str | None = None
    try:
        temp_video_path = await download_webapp_video(video_url, pullup_id)
        await query.message.answer_video(FSInputFile(temp_video_path), caption=caption)
        await query.answer("Отправил видео ещё раз")
    except Exception:
        logger.exception(
            "VIEW_WEBAPP_VIDEO_FAILED pullup_id=%s video_url=%s",
            pullup_id,
            video_url,
        )
        await query.message.answer(
            "Не удалось загрузить видео из WebApp. Проверь video_url и storage."
        )
        await query.answer("Не удалось загрузить видео", show_alert=True)
    finally:
        if temp_video_path:
            Path(temp_video_path).unlink(missing_ok=True)

@dp.callback_query(F.data.startswith("approve:"))
async def cb_approve(query: CallbackQuery):
    if query.from_user.id not in ADMIN_IDS:
        return await query.answer("Только для модератора", show_alert=True)
    
    pullup_id = int(query.data.split(":")[1])
    approve_wait[query.from_user.id] = pullup_id
    await query.message.answer(
        f"Введи <b>количество подтягиваний</b> для начисления по записи #{pullup_id}:",
        reply_markup=ForceReply(selective=True)
    )
    await query.answer()

@dp.callback_query(F.data.startswith("reject:"))
async def cb_reject(query: CallbackQuery):
    if query.from_user.id not in ADMIN_IDS:
        return await query.answer("Только для модератора", show_alert=True)
    
    pullup_id = int(query.data.split(":")[1])
    # спросим причину
    approve_wait.pop(query.from_user.id, None)
    approve_wait[query.from_user.id] = -pullup_id  # отрицательное значение — ждём причину
    await query.message.answer(
        f"Введи <b>причину отклонения</b> для записи #{pullup_id}:",
        reply_markup=ForceReply(selective=True)
    )
    await query.answer()

@dp.message(F.reply_to_message)
async def moderator_inputs(message: Message):
    """
    Обрабатываем ответ модератора на ForceReply:
    - если approve_wait[admin] > 0 — ждём число (count) и одобряем;
    - если < 0 — ждём причину отклонения.
    """
    if message.from_user.id not in ADMIN_IDS:
        return
    
    if message.from_user.id not in approve_wait:
        return
    
    pullup_marker = approve_wait[message.from_user.id]
    
    # ОДОБРЕНИЕ
    if pullup_marker > 0:
        try:
            count = int(message.text.strip())
            if count <= 0:
                raise ValueError
        except ValueError:
            await message.reply("Нужно ввести положительное целое число.")
            return
        
        pullup_id = pullup_marker
        approve_wait.pop(message.from_user.id, None)
        telegram_id = await approve_video(pullup_id, moderator_id=message.from_user.id, count=count)
        
        if telegram_id:
            await message.reply(f"✅ Одобрено #{pullup_id}. Начислено {count} PULLUP.")
            # уведомим пользователя
            try:
                await bot.send_message(
                    telegram_id,
                    f"🎉 Твоё видео №{pullup_id} одобрено!\n"
                    f"Начислено: <b>{count} PULLUP</b>\n"
                    f"Проверить баланс: /tokens"
                )
            except Exception:
                pass
        else:
            await message.reply("Не удалось одобрить — запись не найдена или уже обработана.")
        return
    
    # ОТКЛОНЕНИЕ
    if pullup_marker < 0:
        pullup_id = -pullup_marker
        reason = message.text.strip()[:200]
        approve_wait.pop(message.from_user.id, None)
        ok = await reject_video(pullup_id, moderator_id=message.from_user.id, reason=reason or "Без причины")
        await message.reply("❌ Отклонено." if ok else "Не удалось отклонить — запись не найдена/обработана.")
        
        # опционально: уведомить юзера
        row = await get_pullup(pullup_id)
        if row:
            try:
                await bot.send_message(
                    row["telegram_id"],
                    f"⚠️ Твоё видео №{pullup_id} отклонено.\nПричина: {reason or 'не указана'}"
                )
            except Exception:
                pass
        return

# ================== Запуск ==================
async def main():
    global bot, db_pool
    logger.info("BOT_STARTING")
    try:
        load_bot_config()
        bot = Bot(
            token=BOT_TOKEN,
            default=DefaultBotProperties(parse_mode="HTML"),
        )
        db_pool = await init_db_pool()
        logger.info("DATABASE_CONNECTED")
        await ensure_schema()
        await bot.delete_webhook(drop_pending_updates=False)
        logger.info("WEBHOOK_DELETED")
        await configure_webapp_menu_button()
        logger.info("WEBAPP_MENU_BUTTON_CONFIGURED")
        await bot.set_my_commands(USER_COMMANDS, scope=BotCommandScopeDefault())
        for admin_id in ADMIN_IDS:
            try:
                await bot.set_my_commands(
                    [
                        *USER_COMMANDS,
                        BotCommand(command="pending", description="Очередь модерации"),
                    ],
                    scope=BotCommandScopeChat(chat_id=admin_id),
                )
            except Exception:
                logger.exception("ADMIN_COMMANDS_SETUP_FAILED admin_id=%s", admin_id)
        logger.info("BOT_STARTED mode=polling admin_ids=%s", len(ADMIN_IDS))
        await dp.start_polling(bot)
    except Exception:
        logger.exception("BOT_START_FAILED")
        raise
    finally:
        if db_pool is not None:
            await db_pool.close()
            db_pool = None
        if bot is not None:
            await bot.session.close()
            bot = None
        logger.info("BOT_STOPPED")


if __name__ == "__main__":
    asyncio.run(main())



