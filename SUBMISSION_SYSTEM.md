# Система модерации видео PULLUP

## Как это работает

### Фронтенд (React приложение)
1. Пользователь нажимает "Добавить тренировку"
2. Выбирает тип упражнения (подтягивания, отжимания, планка, бег)
3. Загружает видео или указывает ссылку трекера (для бега)
4. Указывает количество повторений
5. Нажимает "Сохранить"

**Режимы работы:**
- **Демо режим** (без Telegram): просто симулирует отправку
- **Telegram режим** (через WebApp): отправляет видео на модерацию

### Бэкенд (FastAPI)
1. Получает multipart/form-data с видео файлом
2. Создает submission в БД со статусом `pending`
3. Возвращает ID заявки

### Телеграм бот (администратор)
1. Выполняет команду `/pending` для просмотра очереди видео
2. Видит список видео в статусе `pending`
3. Нажимает кнопку "Одобрить" или "Отклонить"
4. Вводит количество повторений (для одобрения) или причину (для отклонения)
5. Бот обновляет статус в БД и начисляет токены пользователю

## Архитектура

```
Frontend (React)
    ↓
AddWorkoutModal (выбор видео + загрузка)
    ↓
submitVideo() (src/api/submissions.ts)
    ↓
POST /submissions (multipart/form-data)
    ↓
Backend (FastAPI)
    ↓
Database (submissions table)
    ↓
Telegram Bot (/pending command)
    ↓
Admin reviews (approve/reject)
    ↓
Database update (status change)
    ↓
User tokens update
```

## API Endpoints

### POST /submissions (создать заявку)
```typescript
// Request (multipart/form-data)
{
  type: "pullups" | "pushups" | "plank" | "running"
  value: number  // количество повторений
  video?: File   // видео файл (опционально для бега)
  video_url?: string  // ссылка трекера (для бега)
}

// Response
{
  id: number
  user_id: number
  type: string
  value: number
  video_file_id: string | null
  video_url: string | null
  status: "pending" | "approved" | "rejected"
  moderator_comment: string | null
  created_at: string
  reviewed_at: string | null
}
```

### GET /submissions (получить свои заявки)
```typescript
// Query params
limit?: number (default: 50)
offset?: number (default: 0)

// Response
SubmissionResponse[]
```

## Структура БД

```sql
CREATE TABLE submissions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('pullups', 'pushups', 'plank', 'running')),
    value INT NOT NULL,
    video_file_id TEXT,
    video_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    moderator_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);
```

## TODO (нужно реализовать)

1. **Сохранение видео на облако**
   - Нужна интеграция с S3, GCS или другим облачным хранилищем
   - Текущий код использует временное имя файла

2. **Загрузка видео в Telegram Bot API**
   - Когда администратор одобряет видео, его можно сохранить в истории бота
   - Нужен токен бота на бэкенде

3. **Webhook для оповещение администратора**
   - Вместо команды `/pending`, администратор будет получать уведомления о новых видео

4. **Интеграция с реальным API загрузки видео**
   - Текущий код примитивен и нуждается в расширении
   - Нужна валидация размера файла
   - Нужна компрессия видео

## Тестирование

### В демо режиме:
```
1. Откройте приложение (не через Telegram)
2. Тренировки → Добавить тренировку
3. Выберите упражнение
4. Загрузите видео
5. Нажмите "Сохранить"
6. В диалоге введите количество повторений
7. Видео будет "отправлено на модерацию"
```

### В режиме Telegram:
```
1. Откройте приложение через бота (@ActiveRunBot)
2. Тренировки → Добавить тренировку
3. Выберите упражнение
4. Загрузите видео (вы увидите прогресс загрузки)
5. Нажмите "Сохранить"
6. Видео отправится на модерацию
7. Администратор получит уведомление и может одобрить/отклонить видео
```

## Обработка ошибок

- **Видео не загружается**: проверьте размер (максимум ~100 МБ)
- **Ошибка при отправке**: проверьте подключение к интернету
- **Заявка не создается**: проверьте, что вы авторизованы в Telegram
