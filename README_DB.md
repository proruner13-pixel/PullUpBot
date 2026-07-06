# PostgreSQL для PULLUP

Схема рассчитана на общую базу для FastAPI, Telegram-бота и React. Главный
публичный идентификатор пользователя — `telegram_id`.

Скрипты не выполняют `DROP DATABASE`, не удаляют таблицы `users` и `pullups`.
Старая таблица прогресса `challenges`, если она существует, переименовывается в
`legacy_user_challenges`, после чего её данные переносятся в новую схему.

## 1. Создание базы в pgAdmin

1. Откройте **pgAdmin 4**.
2. Подключитесь к своему PostgreSQL-серверу.
3. Нажмите правой кнопкой на **Databases** → **Create** → **Database**.
4. В поле **Database** укажите `pullup`.
5. Выберите владельца базы и нажмите **Save**.

Если база `pullup` уже существует, повторно создавать её не нужно.

## 2. Резервная копия существующей базы

Если в базе уже есть реальные пользователи:

1. Нажмите правой кнопкой на базу `pullup`.
2. Выберите **Backup**.
3. Формат — `Custom`.
4. Укажите имя файла и нажмите **Backup**.

Это обязательная страховка перед первой миграцией существующей базы.

## 3. Запуск schema.sql

1. Выберите базу `pullup`.
2. Откройте **Tools** → **Query Tool**.
3. Нажмите **Open File**.
4. Выберите `sql/schema.sql`.
5. Проверьте, что в верхней панели выбрана база `pullup`.
6. Нажмите **Execute/Refresh** или клавишу `F5`.

Скрипт выполняется в транзакции. При ошибке изменения не должны быть частично
зафиксированы.

## 4. Запуск seed.sql

1. В Query Tool откройте `sql/seed.sql`.
2. Нажмите `F5`.

Скрипт создаёт базовые челленджи и достижения. Он также обнуляет только
демо-пользователя `123456789`: удаляет его тестовые отправки, транзакции,
рефералы, старые подтягивания и открытые достижения. Другие пользователи не
изменяются.

## 5. Проверка таблиц

В дереве pgAdmin откройте:

`Schemas` → `public` → `Tables`

Ожидаемые основные таблицы:

- `users`;
- `pullups`;
- `submissions`;
- `challenges`;
- `user_challenges`;
- `achievements`;
- `user_achievements`;
- `token_transactions`;
- `referrals`.

Если до миграции существовала старая таблица `challenges`, дополнительно будет
`legacy_user_challenges`. Не удаляйте её до отдельной проверки переноса.

Проверить список можно запросом:

```sql
SELECT tablename
FROM pg_catalog.pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Проверить внешние ключи:

```sql
SELECT
    constraint_name,
    table_name
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND constraint_type = 'FOREIGN KEY'
ORDER BY table_name, constraint_name;
```

## 6. Проверка демо-пользователя

```sql
SELECT
    telegram_id,
    username,
    tokens,
    level,
    streak_days,
    referrals_count
FROM public.users
WHERE telegram_id = 123456789;
```

Ожидается:

- `tokens = 0`;
- `level = 1`;
- `streak_days = 0`;
- `referrals_count = 0`.

Проверка прогресса:

```sql
SELECT
    challenge.slug,
    user_challenge.progress,
    user_challenge.completed
FROM public.user_challenges AS user_challenge
JOIN public.challenges AS challenge
  ON challenge.id = user_challenge.challenge_id
WHERE user_challenge.user_id = 123456789
ORDER BY challenge.slug;
```

Все значения `progress` должны быть `0`, а `completed` — `false`.

Проверка закрытых достижений:

```sql
SELECT COUNT(*) AS unlocked_achievements
FROM public.user_achievements
WHERE user_id = 123456789;
```

Ожидается `0`.

## 7. Подключение приложения

Укажите строку PostgreSQL в backend `.env`, например:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/pullup
```

Для frontend:

```env
VITE_API_URL=https://pullup-backend-dtxl.onrender.com
```

Если `VITE_API_URL` не указан, frontend продолжает работать локально через
mock-данные и `localStorage`.

После применения новой схемы не запускайте старую миграцию
`001_create_challenges.up.sql`: она описывает прежний формат таблицы
`challenges`.
