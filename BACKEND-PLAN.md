# BACKEND-PLAN.md — Архитектурный план бэкенда

> Стек: Vercel Serverless Functions (Node.js 20) + Supabase (PostgreSQL + Storage) + Telegram Bot API.
> **Статус:** реализован полностью (коммит 6ae8488). Документ актуален на 2026-05-27.

---

## 1. Обзор системы

```
┌──────────────────────────────────────────────────────────────┐
│                    КЛИЕНТ (Telegram)                          │
│  Mini App → выбирает параметры → оставляет контакт           │
└──────────────────────┬───────────────────────────────────────┘
                       │ POST /api/lead
┌──────────────────────▼───────────────────────────────────────┐
│               VERCEL FUNCTIONS (бэкенд)                       │
│  api/lead.js         — принять, сохранить, PDF, уведомить    │
│  api/prices.js       — отдать текущие цены фронтенду         │
│  api/faq.js          — ответы по шагам калькулятора          │
│  api/portfolio.js    — фото портфолио                        │
│  api/webhook.js      — Telegram webhook (FAQ, /addphoto)     │
│  api/admin/          — защищённые маршруты собственника      │
└──────┬──────────────────────────┬────────────────────────────┘
       │                          │
┌──────▼──────┐           ┌───────▼──────────────────────────┐
│  SUPABASE   │           │      TELEGRAM BOT API             │
│  PostgreSQL │           │  - sendMessage (уведомление       │
│  Storage    │           │    собственнику с параметрами лида)│
│  (PDF-файлы)│           │  - /addphoto (добавить портфолио) │
└──────┬──────┘           │  - FAQ-кнопки (консультант)       │
       │                  └───────────────────────────────────┘
       │ pdf public URL
       ↓
 screen-9 «Скачать смету PDF»
 (ссылка на Supabase Storage, не через Telegram)

┌────────────────────────────────────────────────────────────┐
│     ВЕБ-ПАНЕЛЬ СОБСТВЕННИКА  /admin/index.html              │
│  - все лиды / история / статусы                            │
│  - редактирование цен (PUT /api/admin/prices)              │
└────────────────────────────────────────────────────────────┘
```

---

## 2. База данных (Supabase PostgreSQL)

Миграция: `supabase/migrations/001_init.sql`

### Таблица `leads`

```sql
CREATE TABLE leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  tg_user_id    BIGINT,
  tg_username   TEXT,
  region        TEXT,          -- 'kaluga' | 'obninsk' | 'moscow_obl' | 'new_moscow'
  area          INTEGER,
  floors        TEXT,          -- 'single' | 'mansard' | 'double'
  foundation    TEXT,          -- 'pile' | 'strip' | 'slab' | 'ushp'
  roof_material TEXT,          -- 'metalTile' | 'softRoofing' | 'standingSeam'
  roof_shape    TEXT,          -- 'gable' | 'hip' | 'flat'
  style         TEXT,          -- 'classic' | 'hitech' | 'chalet'
  facade        TEXT,          -- 'plaster' | 'brick' | 'panel' | 'none'
  finishing     TEXT,          -- 'shell' | 'rough' | 'whitebox' | 'turnkeyEco' | 'turnkeyStd'
  options       TEXT[] DEFAULT '{}',
  total         BIGINT,
  pdf_url       TEXT,
  manager_notified BOOLEAN DEFAULT FALSE,
  status        TEXT DEFAULT 'new'   -- 'new' | 'called' | 'accepted' | 'refused'
);
```

Индексы: `created_at DESC`, `status`, `phone`.

---

### Таблица `prices`

```sql
CREATE TABLE prices (
  id TEXT PRIMARY KEY DEFAULT 'current',  -- одна строка
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Региональные коэффициенты
  region_kaluga       NUMERIC DEFAULT 1.00,
  region_obninsk      NUMERIC DEFAULT 1.00,
  region_moscow_obl   NUMERIC DEFAULT 1.15,
  region_new_moscow   NUMERIC DEFAULT 1.15,

  -- Коробка (₽/м²)
  box_single   INTEGER DEFAULT 22000,
  box_mansard  INTEGER DEFAULT 20000,
  box_double   INTEGER DEFAULT 19000,

  -- Фундамент (₽/м²)
  foundation_pile   INTEGER DEFAULT 4000,
  foundation_strip  INTEGER DEFAULT 7000,
  foundation_slab   INTEGER DEFAULT 10000,
  foundation_ushp   INTEGER DEFAULT 16000,

  -- Кровля (коэффициент)
  roof_metal_tile     NUMERIC DEFAULT 1.00,
  roof_soft_roofing   NUMERIC DEFAULT 1.08,
  roof_standing_seam  NUMERIC DEFAULT 1.15,
  roof_gable  NUMERIC DEFAULT 1.00,
  roof_hip    NUMERIC DEFAULT 1.12,
  roof_flat   NUMERIC DEFAULT 0.95,

  -- Фасад (₽/м²)
  facade_plaster INTEGER DEFAULT 3500,
  facade_brick   INTEGER DEFAULT 8000,
  facade_panel   INTEGER DEFAULT 5500,

  -- Отделка (₽/м²)
  finishing_shell       INTEGER DEFAULT 0,
  finishing_rough       INTEGER DEFAULT 7000,
  finishing_whitebox    INTEGER DEFAULT 10000,
  finishing_turnkey_eco INTEGER DEFAULT 12000,
  finishing_turnkey_std INTEGER DEFAULT 22000,

  -- Стиль (коэффициент)
  style_classic  NUMERIC DEFAULT 1.00,
  style_hitech   NUMERIC DEFAULT 1.10,
  style_chalet   NUMERIC DEFAULT 1.18,

  -- Опции (₽ фиксированные)
  option_terrace   INTEGER DEFAULT 200000,
  option_garage    INTEGER DEFAULT 380000,
  option_bathhouse INTEGER DEFAULT 420000
);

INSERT INTO prices (id) VALUES ('current');
```

---

### Таблица `prices_history`

```sql
CREATE TABLE prices_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  field_name TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  changed_by TEXT
);
```

---

### Таблица `portfolio`

```sql
CREATE TABLE portfolio (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  title      TEXT NOT NULL,
  photo_url  TEXT NOT NULL,
  is_visible BOOLEAN DEFAULT TRUE
);
```

---

### Таблица `faq`

```sql
CREATE TABLE faq (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step       TEXT NOT NULL,   -- 'foundation' | 'roof' | 'style' | 'facade' | 'finishing'
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);
```

---

### Таблица `bot_sessions`

```sql
CREATE TABLE bot_sessions (
  tg_user_id BIGINT PRIMARY KEY,
  state      TEXT NOT NULL,  -- 'addphoto_await_title' | 'addphoto_await_photo'
  data       JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL
);
```

---

## 3. API — все эндпоинты

### Файловая структура

```
api/
├── _supabase.js          — общий Supabase-клиент (не route)
├── _jwt.js               — signAdminToken / verifyAdminToken
├── lead.js               POST /api/lead
├── prices.js             GET  /api/prices
├── faq.js                GET  /api/faq?step=X
├── portfolio.js          GET  /api/portfolio
├── webhook.js            POST /api/webhook
├── pdf-template.js       — генератор PDF (не route)
└── admin/
    ├── login.js          POST /api/admin/login
    ├── leads.js          GET  /api/admin/leads?page=1&limit=50
    ├── leads/[id].js     GET/PATCH /api/admin/leads/:id
    └── prices.js         GET/PUT  /api/admin/prices
```

### Публичные эндпоинты

| Метод | URL | Что делает |
|-------|-----|------------|
| `POST` | `/api/lead` | Сохранить лид → генерировать PDF → отправить в Telegram → вернуть `{ ok, pdfUrl }` |
| `GET` | `/api/prices` | Текущий прайс из Supabase (или fallback), `{ ok, prices, source }` |
| `GET` | `/api/faq?step=X` | Список вопросов-ответов по шагу: `[{ question, answer }]` |
| `GET` | `/api/portfolio` | Видимые фото: `[{ id, title, photo_url }]` |
| `POST` | `/api/webhook` | Telegram webhook — /start, /addphoto, FAQ callback |

### Защищённые эндпоинты (требуют `Authorization: Bearer <JWT>`)

| Метод | URL | Что делает |
|-------|-----|------------|
| `POST` | `/api/admin/login` | Проверить пароль → вернуть JWT (8 ч) |
| `GET` | `/api/admin/leads` | Список лидов с пагинацией |
| `GET` | `/api/admin/leads/:id` | Полная запись лида |
| `PATCH` | `/api/admin/leads/:id` | Обновить `status` и/или `notes` |
| `GET` | `/api/admin/prices` | Текущий прайс (все поля) |
| `PUT` | `/api/admin/prices` | Сохранить новый прайс → записать в `prices_history` |

---

## 4. Ключевые флоу

### Флоу 1 — Клиент оставляет заявку

```
1. Клиент заполняет форму (имя + телефон) → POST /api/lead
2. api/lead.js:
   a. Валидирует name + phone (обязательны)
   b. Суpabase: INSERT INTO leads (если настроен, иначе пропускает)
   c. PDFKit: генерирует PDF-смету в памяти (Buffer)
   d. Supabase Storage: upload {leadId}.pdf в bucket 'pdfs'
   e. Получает публичный URL: supabase.storage.getPublicUrl(...)
   f. Обновляет leads.pdf_url
   g. Telegram: sendMessage собственнику с параметрами лида
   h. Обновляет leads.manager_notified = true
3. Возвращает { ok: true, pdfUrl: "https://..." }
4. screen-9: показывает кнопку «Скачать смету PDF» с этим URL
```

> **Важно:** PDF не отправляется через Telegram Bot — бот не может писать пользователям, которые не начали с ним диалог. Клиент получает ссылку на скачивание прямо в Mini App.

> **Без Supabase:** функция работает в degraded режиме — лид не сохраняется в БД, PDF не генерируется, но Telegram-уведомление всё равно приходит.

---

### Флоу 2 — Собственник добавляет фото через Telegram

```
1. Собственник пишет /addphoto боту
2. webhook.js: проверяет userId === TELEGRAM_OWNER_ID
   → сохраняет в bot_sessions: { state: 'addphoto_await_title', expires_at: +1ч }
   → бот просит ввести название объекта
3. Собственник вводит название
   → обновляет bot_sessions: state: 'addphoto_await_photo', data: { title }
   → бот просит прислать фото
4. Собственник присылает фото
   → getFile → получает Telegram URL фото
   → INSERT INTO portfolio(title, photo_url)
   → DELETE FROM bot_sessions
   → бот: «✅ Объект добавлен»
```

---

### Флоу 3 — Собственник меняет цены

```
1. Заходит на /admin/ → вводит пароль
2. POST /api/admin/login → JWT
3. Видит таблицу цен (GET /api/admin/prices)
4. Меняет значения → Сохранить
5. PUT /api/admin/prices
   → INSERT INTO prices_history (старые значения)
   → UPDATE prices SET ... WHERE id = 'current'
6. При следующем открытии Mini App загрузит новые цены через GET /api/prices
```

---

### Флоу 4 — FAQ в Telegram боте

```
Клиент в Mini App нажимает FAQ-кнопку (inline keyboard) →
Telegram отправляет callback_query с data='faq:foundation' в webhook →
webhook.js: supabase.from('faq').select().eq('step','foundation') →
Бот отвечает текстом вопрос+ответ в чат пользователя
```

---

## 5. PDF-смета

Генерируется через **PDFKit** в `api/pdf-template.js`.

**Функция:** `generateEstimatePDF(data)` → возвращает `Promise<Buffer>`

**Входные данные:**
```js
{
  name, phone, region, area, floors, foundation,
  roofMaterial, roofShape, style, facade, finishing, options,
  breakdown: { foundation, box, roof, style, facade, finishing, options, region },
  total, perSqm, mortgage
}
```

**Структура документа:**
```
[Заголовок компании]
РАСЧЁТ СТОИМОСТИ СТРОИТЕЛЬСТВА
Дата: ДД.ММ.ГГГГ  |  Клиент: Имя

ПАРАМЕТРЫ ДОМА
  Площадь, этажность, регион, стиль

СМЕТА ПО ЭТАПАМ
  Фундамент         XXX ₽
  Коробка           XXX ₽
  Кровля            XXX ₽
  Надбавка стиль    XXX ₽  (если не классика)
  Фасад             XXX ₽  (если выбран)
  Отделка           XXX ₽  (если не коробка)
  Региональная надбавка +15%  (если МО/НМ)
  Опции             XXX ₽  (если выбраны)

ИТОГО: X XXX XXX ₽  (X XXX ₽/м²)
Точность расчёта: ±10–15%

Ипотека 6% · 20 лет: от XX XXX ₽/мес

[Контакты компании]
[Юридическая оговорка]
```

---

## 6. Безопасность

### Supabase RLS
Все таблицы: `ENABLE ROW LEVEL SECURITY`.
Политика: `USING (auth.role() = 'service_role')` — только бэкенд с service_role ключом имеет доступ.
Фронтенд **никогда** не обращается к Supabase напрямую.

### JWT для панели
- `api/_jwt.js`: `signAdminToken()` / `verifyAdminToken(req)`
- Алгоритм: HS256, экспирация 8 часов
- Secret: `JWT_SECRET` из env (≥32 символа)
- Передаётся в заголовке: `Authorization: Bearer <token>`

### Telegram webhook
```js
// Проверка в api/webhook.js
const secret = req.headers['x-telegram-bot-api-secret-token'];
if (secret && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
  return res.status(403).end();
}
```

Регистрация с секретом:
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://ВАШ-САЙТ.vercel.app/api/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

### vercel.json — защита API от SPA rewrite
```json
{
  "outputDirectory": "tg-app",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```
Негативный lookahead `(?!api/)` исключает `api/*` из SPA-редиректа.

---

## 7. Переменные окружения

| Переменная | Тип | Назначение |
|------------|-----|-----------|
| `TELEGRAM_BOT_TOKEN` | Секрет | Токен бота из BotFather |
| `TELEGRAM_CHAT_ID` | Конфиг | chat_id собственника для уведомлений |
| `TELEGRAM_OWNER_ID` | Конфиг | user_id собственника (для /addphoto) |
| `TELEGRAM_WEBHOOK_SECRET` | Секрет | Валидация webhook запросов |
| `SUPABASE_URL` | Конфиг | URL Supabase проекта |
| `SUPABASE_SERVICE_KEY` | Секрет | service_role ключ (только бэкенд!) |
| `ADMIN_PASSWORD` | Секрет | Пароль входа в /admin/ |
| `JWT_SECRET` | Секрет | Подпись JWT (≥32 символа) |

> Секреты никогда не попадают в frontend-код и не коммитятся в git (`.env` в `.gitignore`).

---

## 8. Примеры запросов и ответов

### POST /api/lead

**Запрос:**
```json
{
  "name": "Алексей",
  "phone": "79161234567",
  "region": "kaluga",
  "area": 120,
  "floors": "single",
  "foundation": "pile",
  "roofMaterial": "metalTile",
  "roofShape": "gable",
  "style": "classic",
  "facade": "plaster",
  "finishing": "rough",
  "options": [],
  "total": 3660000,
  "breakdown": { "foundation": 480000, "box": 2640000, "roof": 0, "style": 0, "facade": 420000, "finishing": 840000, "options": 0, "region": 0 },
  "perSqm": 30500,
  "mortgage": 26237,
  "tgUser": { "id": 123456789, "username": "alexey", "first_name": "Алексей" }
}
```

**Ответ 200:**
```json
{ "ok": true, "pdfUrl": "https://xyz.supabase.co/storage/v1/object/public/pdfs/uuid.pdf" }
```

**Ответ 200 (без Supabase):**
```json
{ "ok": true, "pdfUrl": null }
```

---

### GET /api/prices

**Ответ 200 (из Supabase):**
```json
{
  "ok": true,
  "source": "db",
  "prices": {
    "boxPerSqm": { "single": 22000, "mansard": 20000, "double": 19000 },
    "foundation": { "pile": 4000, "strip": 7000, "slab": 10000, "ushp": 16000 },
    "roofMaterial": { "metalTile": 1.00, "softRoofing": 1.08, "standingSeam": 1.15 },
    "roofShape": { "gable": 1.00, "hip": 1.12, "flat": 0.95 },
    "style": { "classic": 1.00, "hitech": 1.10, "chalet": 1.18 },
    "facade": { "plaster": 3500, "brick": 8000, "panel": 5500 },
    "finishing": { "shell": 0, "rough": 7000, "whitebox": 10000, "turnkeyEco": 12000, "turnkeyStd": 22000 },
    "options": { "terrace": 200000, "garage": 380000, "bathhouse": 420000 },
    "region": { "kaluga": 1.00, "obninsk": 1.00, "moscow_obl": 1.15, "new_moscow": 1.15 }
  }
}
```

**Ответ (fallback без Supabase):**
```json
{ "ok": true, "source": "fallback", "prices": { ... } }
```

---

### PATCH /api/admin/leads/:id

**Заголовок:** `Authorization: Bearer <jwt>`

**Запрос:**
```json
{ "status": "called", "notes": "Перезвонил, интересует 150 м²" }
```

**Ответ 200:** `{ "ok": true }`

**Статусы лида:** `new` → `called` → `accepted` / `refused`

---

### PUT /api/admin/prices

**Заголовок:** `Authorization: Bearer <jwt>`

**Запрос:** полный объект `prices` (все ключи JS в camelCase, функция маппит в snake_case для БД)

**Ответ 200:** `{ "ok": true }`

---

## 9. Технологический стек

| Компонент | Технология | Почему |
|-----------|-----------|--------|
| Serverless функции | Vercel Functions Node.js 20 | Уже задеплоено, Hobby plan |
| База данных | Supabase PostgreSQL | Бесплатный тариф 500MB |
| Хранилище PDF | Supabase Storage (bucket `pdfs`) | 1GB бесплатно, публичные URL |
| PDF генерация | PDFKit | Работает в Node.js, без внешних сервисов |
| Аутентификация | JWT (jsonwebtoken) + пароль в env | Просто, надёжно для одного пользователя |
| Веб-панель | Чистый HTML/CSS/JS (один файл) | Без сборки, деплоится вместе с приложением |
| Telegram | Bot API (HTTPS) | Уведомления собственнику + webhook |

---

## 10. Что НЕ реализовано (за скоупом)

| Что | Почему |
|-----|--------|
| CRM-интеграция (AmoCRM / Битрикс) | Статусы в своей БД достаточно на старте |
| GPT-консультант | FAQ-кнопки надёжнее и бесплатны |
| Экран портфолио в Mini App | Низкий приоритет (шаг 11 плана), `GET /api/portfolio` готов |
| Push follow-up через 2–3 дня | После валидации спроса |
| Авторизация клиента (история расчётов) | Излишняя сложность |
| Онлайн-оплата | Не нужно для лидогенерации |
| Сравнение двух конфигураций | После валидации спроса |
