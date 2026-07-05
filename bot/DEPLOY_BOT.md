# PULLUP Telegram Bot

Бот является входной точкой и помощником для Telegram Mini App. Он открывает
PULLUP, принимает видеоподтверждения и предоставляет модератору очередь заявок.

## Переменные окружения

Создайте единственный `.env` в корне проекта по примеру `.env.example`.
Файл `bot/.env` не используется: backend, bot и migrations должны читать
одни и те же настройки из `C:/PullUpBot/.env`.

Обязательные production-переменные:

```env
APP_ENV=production
BOT_TOKEN=telegram-bot-token
ADMIN_ID=123456789
WEBAPP_URL=https://pullupbot.vercel.app
BOT_PUBLIC_URL=https://t.me/ActiveRunBot
SUPPORT_URL=https://t.me/ActiveRunBot
WEBAPP_DEEP_LINKS_ENABLED=false

DATABASE_URL=postgresql://postgres:password@postgres-host:5432/pullup
```

`WEBAPP_DEEP_LINKS_ENABLED=false` оставляет все кнопки на главной странице
Mini App. После поддержки query-навигации можно включить значение `true`;
бот уже формирует ссылки `?screen=profile`, `?screen=rating` и
`?screen=submit`.

## Локальный запуск

Из корня проекта:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r bot\requirements.txt
python -m bot.main
```

## Запуск 24/7

Команда процесса:

```text
python -m bot.main
```

Для production используйте один polling-процесс. Не запускайте две копии с
одним `BOT_TOKEN`, иначе Telegram будет прерывать получение обновлений.

## Проверка

1. Отправьте `/start` и убедитесь, что появилась кнопка `Открыть PULLUP`.
2. Кнопка должна открывать `WEBAPP_URL` как Telegram Web App.
3. Отправьте `/submit`, затем видео — оно должно попасть в `pullups` со
   статусом `pending`.
4. От имени `ADMIN_ID` выполните `/pending` и проверьте кнопки модерации.
5. От обычного аккаунта меню не должно содержать `/pending`.
