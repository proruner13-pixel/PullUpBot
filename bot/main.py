# bot/main.py
import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import random

import asyncio
import logging
import secrets
from typing import Optional, Dict
from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    Message, CallbackQuery,
    InlineKeyboardMarkup, InlineKeyboardButton, ForceReply,
    BotCommand, BotCommandScopeDefault, BotCommandScopeChat, User, FSInputFile
)
import asyncpg
from aiogram.types import WebAppInfo
from app.config import ROOT_ENV_FILE, Settings, root_env_keys


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("pullup.bot")


# ================== Конфиг ==================
settings = Settings.from_env()
BOT_TOKEN = settings.bot_token
DATABASE_URL = settings.database_dsn
ADMIN_ID = settings.admin_id
APP_ENV = settings.environment
WEBAPP_URL = settings.webapp_url
API_URL = settings.api_url
BOT_PUBLIC_URL = os.getenv("BOT_PUBLIC_URL", "https://t.me/ActiveRunBot").strip()
SUPPORT_URL = os.getenv("SUPPORT_URL", BOT_PUBLIC_URL).strip()
WEBAPP_DEEP_LINKS_ENABLED = (
    os.getenv("WEBAPP_DEEP_LINKS_ENABLED", "false").lower() == "true"
)

if not WEBAPP_URL:
    if APP_ENV == "production":
        raise RuntimeError("WEBAPP_URL не задан в production")
    WEBAPP_URL = "https://pullupbot.vercel.app"

if not BOT_TOKEN:
    found_variables = ", ".join(root_env_keys()) or "<none>"
    raise RuntimeError(
        "BOT_TOKEN не задан или содержит placeholder. "
        f"Проверен файл: {ROOT_ENV_FILE}. "
        f"Найдены переменные: {found_variables}"
    )
if APP_ENV == "production" and not ADMIN_ID:
    raise RuntimeError("ADMIN_ID не задан в production")

# aiogram 3.7+: parse_mode задаётся через DefaultBotProperties
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode="HTML"))
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
    moderated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pullups_status ON pullups(status);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
"""

# На всякий случай "мягко" добавим недостающие колонки (если будем расширять)
ALTERS = [
    ("users", "display_name", "TEXT"),
    ("users", "ref_code", "TEXT UNIQUE"),
    ("users", "referred_by", "INT REFERENCES users(id) ON DELETE SET NULL"),
    ("users", "referrals_count", "INT NOT NULL DEFAULT 0"),
    ("pullups", "file_path", "TEXT"),
    ("pullups", "file_url", "TEXT"),
    ("pullups", "source", "TEXT NOT NULL DEFAULT 'telegram'"),
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
        await conn.execute("ALTER TABLE pullups ALTER COLUMN video_file_id DROP NOT NULL")
        for table, column, ddl in ALTERS:
            try:
                await conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
            except asyncpg.DuplicateColumnError:
                pass

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
            row = await conn.fetchrow("SELECT user_id, status FROM pullups WHERE id=$1 FOR UPDATE", pullup_id)
            if not row or row["status"] != "pending":
                return None
            
            await conn.execute("""
                UPDATE pullups SET status='approved', count=$2, moderator_id=$3, moderated_at=NOW()
                WHERE id=$1
            """, pullup_id, count, moderator_id)
            
            await conn.execute("UPDATE users SET tokens = tokens + $2 WHERE id=$1", row["user_id"], count)
            
            u = await conn.fetchrow("SELECT telegram_id FROM users WHERE id=$1", row["user_id"])
            return u["telegram_id"] if u else None

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
    balance = await get_tokens(message.from_user.id)
    await message.answer(
        f"<b>Баланс: {balance} PULLUP</b>\n\n"
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
    return message.from_user.id == ADMIN_ID

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

    logger.info(
        "PENDING_FOUND pullup_id=%s source=%s user_id=%s",
        pullup_id,
        row["source"] or "telegram",
        row["user_id"],
    )
    uname = row["display_name"] or (("@" + row["username"]) if row["username"] else f"id{row['telegram_id']}")
    caption = (
        f"<b>На модерации #{pullup_id}</b>\n"
        f"От: {uname}\n"
        f"User ID: {row['user_id']}\n"
        f"Статус: {row['status']}\n\n"
        f"Источник: {row['source'] or 'telegram'}\n"
        f"Создано: {row['created_at']}\n\n"
        f"{row['caption'] or ''}"
    ).strip()

    source = row["source"] or "telegram"
    if source == "webapp":
        logger.info("PENDING_SOURCE_WEBAPP pullup_id=%s", pullup_id)
        if row["file_url"]:
            await bot.send_video(
                chat_id,
                row["file_url"],
                caption=caption,
                reply_markup=moderation_kb(pullup_id),
            )
        elif row["file_path"] and os.path.exists(row["file_path"]):
            await bot.send_video(
                chat_id,
                FSInputFile(row["file_path"]),
                caption=caption,
                reply_markup=moderation_kb(pullup_id),
            )
        else:
            await bot.send_message(
                chat_id,
                f"{caption}\n\nВидео недоступно: файл или ссылка не найдены.",
                reply_markup=moderation_kb(pullup_id),
            )
    else:
        logger.info("PENDING_SOURCE_TELEGRAM pullup_id=%s", pullup_id)
        await bot.send_video(
            chat_id,
            row["video_file_id"],
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
    if query.from_user.id != ADMIN_ID:
        return await query.answer("Только для модератора", show_alert=True)
    
    pullup_id = int(query.data.split(":")[1])
    ids = await list_pending_ids(50)
    await open_item(query.message.chat.id, pullup_id, ids)
    await query.answer()

@dp.callback_query(F.data.startswith("view:"))
async def cb_view(query: CallbackQuery):
    if query.from_user.id != ADMIN_ID:
        return await query.answer("Только для модератора", show_alert=True)
    
    pullup_id = int(query.data.split(":")[1])
    row = await get_pullup(pullup_id)
    if not row:
        await query.answer("Не найдено", show_alert=True)
        return
    
    await query.message.answer_video(
        row["video_file_id"],
        caption=f"Видео #{pullup_id}\n{row['caption'] or ''}"
    )
    await query.answer("Отправил видео ещё раз")

@dp.callback_query(F.data.startswith("approve:"))
async def cb_approve(query: CallbackQuery):
    if query.from_user.id != ADMIN_ID:
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
    if query.from_user.id != ADMIN_ID:
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
    if message.from_user.id != ADMIN_ID:
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
    global db_pool
    db_pool = await init_db_pool()
    await ensure_schema()
    await bot.delete_webhook(drop_pending_updates=False)
    await bot.set_my_commands(
        USER_COMMANDS,
        scope=BotCommandScopeDefault(),
    )
    if ADMIN_ID:
        try:
            await bot.set_my_commands(
                [
                    *USER_COMMANDS,
                    BotCommand(
                        command="pending",
                        description="Очередь модерации",
                    ),
                ],
                scope=BotCommandScopeChat(chat_id=ADMIN_ID),
            )
        except Exception as error:
            print(f"[BOT] Не удалось настроить меню модератора: {error}")
    logger.info("BOT_STARTED mode=polling admin_id=%s", ADMIN_ID)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())



