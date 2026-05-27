# BACKEND-PLAN.md — Архитектурный план бэкенда

> Документ для разработки бэкенда под ключ.
> Стек: Vercel Serverless Functions (Node.js) + Supabase (PostgreSQL + Storage) + Telegram Bot API.

---

## 1. Что строим — обзор системы

```
┌──────────────────────────────────────────────────────────┐
│                  КЛИЕНТ (Telegram)                        │
│  Mini App → выбирает параметры → оставляет телефон        │
└──────────────────────┬───────────────────────────────────┘
                       │ POST /api/lead
┌──────────────────────▼───────────────────────────────────┐
│              VERCEL FUNCTIONS (бэкенд)                    │
│  api/lead.js         — принять, сохранить, PDF, уведомить│
│  api/prices.js       — отдать текущие цены фронтенду     │
│  api/faq.js          — ответы консультанта по шагам      │
│  api/portfolio.js    — фото портфолио                    │
│  api/webhook.js      — Telegram webhook (FAQ, /addphoto) │
│  api/admin/          — защищённые маршруты собственника  │
└──────┬─────────────────────────┬────────────────────────┘
       │                         │
┌──────▼──────┐          ┌───────▼──────────────────────┐
│  SUPABASE   │          │     TELEGRAM BOT API          │
│  PostgreSQL │          │  - sendDocument (PDF клиенту) │
│  Storage    │          │  - sendMessage (уведомление   │
│  (фото)     │          │    собственнику)              │
└─────────────┘          │  - FAQ-кнопки (консультант)   │
                         └──────────────────────────────┘
                                      │
               ┌──────────────────────▼─────────────────┐
               │     ВЕБ-ПАНЕЛЬ СОБСТВЕННИКА             │
               │  /admin/index.html (защищена паролем)   │
               │  - все лиды / история клиентов          │
               │  - редактирование цен                   │
               │  - просмотр портфолио                   │
               └────────────────────────────────────────┘
```

---

## 2. База данных (Supabase PostgreSQL)

### Таблица `leads` — клиенты и заявки

```sql
CREATE TABLE leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Контакт клиента
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,

  -- Telegram-данные (если пришёл из Mini App)
  tg_user_id    BIGINT,
  tg_username   TEXT,
  tg_first_name TEXT,

  -- Параметры расчёта
  region        TEXT NOT NULL,          -- 'kaluga' | 'obninsk' | 'moscow_obl' | 'new_moscow'
  area          INTEGER NOT NULL,       -- м²
  floors        TEXT NOT NULL,          -- 'single' | 'mansard' | 'double'
  foundation    TEXT NOT NULL,          -- 'pile' | 'strip' | 'slab' | 'ushp'
  roof_material TEXT NOT NULL,          -- 'metalTile' | 'softRoofing' | 'standingSeam'
  roof_shape    TEXT NOT NULL,          -- 'gable' | 'hip' | 'flat'
  facade        TEXT,                   -- 'plaster' | 'brick_facing' | 'panel' | 'none'
  finishing     TEXT NOT NULL,          -- 'shell' | 'rough' | 'whitebox' | 'turnkeyEco' | 'turnkeyStd'
  style         TEXT NOT NULL,          -- 'classic' | 'hitech' | 'chalet'
  options       TEXT[] DEFAULT '{}',    -- ['terrace', 'garage', 'bathhouse']

  -- Итог расчёта
  total         BIGINT NOT NULL,        -- итоговая сумма в ₽

  -- Статус обработки
  pdf_sent         BOOLEAN DEFAULT FALSE,
  manager_notified BOOLEAN DEFAULT FALSE,
  status           TEXT DEFAULT 'new'   -- 'new' | 'called' | 'contract' | 'rejected'
);

-- Индексы для быстрой выборки в веб-панели
CREATE INDEX idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX idx_leads_status     ON leads (status);
CREATE INDEX idx_leads_phone      ON leads (phone);
```

> `finishing = 'whitebox'` уже покрывает шаг «Вайт Бокс» — отдельное поле `white_box BOOLEAN` не нужно.

---

### Таблица `prices` — редактируемые цены

```sql
CREATE TABLE prices (
  id TEXT PRIMARY KEY DEFAULT 'current',  -- всегда одна строка с id = 'current'
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'owner',

  -- Регионы: коэффициенты
  region_kaluga       NUMERIC DEFAULT 1.00,
  region_obninsk      NUMERIC DEFAULT 1.00,
  region_moscow_obl   NUMERIC DEFAULT 1.15,
  region_new_moscow   NUMERIC DEFAULT 1.15,

  -- Коробка из газобетона, ₽/м²
  box_single   INTEGER DEFAULT 22000,
  box_mansard  INTEGER DEFAULT 20000,
  box_double   INTEGER DEFAULT 19000,

  -- Фундамент, ₽/м²
  foundation_pile   INTEGER DEFAULT 4000,
  foundation_strip  INTEGER DEFAULT 7000,
  foundation_slab   INTEGER DEFAULT 10000,
  foundation_ushp   INTEGER DEFAULT 16000,

  -- Кровля (материал), коэффициент
  roof_metal_tile     NUMERIC DEFAULT 1.00,
  roof_soft_roofing   NUMERIC DEFAULT 1.08,
  roof_standing_seam  NUMERIC DEFAULT 1.15,

  -- Кровля (форма), коэффициент
  roof_gable  NUMERIC DEFAULT 1.00,
  roof_hip    NUMERIC DEFAULT 1.12,
  roof_flat   NUMERIC DEFAULT 0.95,

  -- Фасад, ₽/м²
  facade_plaster      INTEGER DEFAULT 3000,
  facade_brick_facing INTEGER DEFAULT 6500,
  facade_panel        INTEGER DEFAULT 4500,

  -- Отделка, ₽/м²
  finishing_shell       INTEGER DEFAULT 0,
  finishing_rough       INTEGER DEFAULT 7000,
  finishing_whitebox    INTEGER DEFAULT 14000,
  finishing_turnkey_eco INTEGER DEFAULT 19000,
  finishing_turnkey_std INTEGER DEFAULT 28000,

  -- Стиль, коэффициент
  style_classic  NUMERIC DEFAULT 1.00,
  style_hitech   NUMERIC DEFAULT 1.10,
  style_chalet   NUMERIC DEFAULT 1.18,

  -- Опции, фиксированные суммы ₽
  option_terrace   INTEGER DEFAULT 200000,
  option_garage    INTEGER DEFAULT 380000,
  option_bathhouse INTEGER DEFAULT 420000
);

-- Инициализация единственной строки при первом развёртывании
INSERT INTO prices (id) VALUES ('current');
```

> Таблица содержит **одну строку** с `id = 'current'`. Обновление через `UPDATE prices SET ... WHERE id = 'current'`. История изменений — в `prices_history`.

---

### Таблица `prices_history` — история изменений цен

```sql
CREATE TABLE prices_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  field_name TEXT NOT NULL,   -- 'foundation_pile'
  old_value  TEXT,
  new_value  TEXT,
  changed_by TEXT             -- 'owner' / IP
);
```

---

### Таблица `portfolio` — фото готовых объектов

```sql
CREATE TABLE portfolio (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  title       TEXT NOT NULL,        -- 'Дом 120 м² в Калуге'
  description TEXT,
  style       TEXT,                 -- 'classic' | 'hitech' | 'chalet'
  area        INTEGER,              -- м²
  region      TEXT,
  photo_url   TEXT NOT NULL,        -- URL из Supabase Storage
  is_visible  BOOLEAN DEFAULT TRUE  -- можно скрыть без удаления
);
```

---

### Таблица `faq` — ответы консультанта

```sql
CREATE TABLE faq (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step       TEXT NOT NULL,    -- 'foundation' | 'walls' | 'roof' | 'facade' | 'whitebox' | 'finishing' | 'company' | 'general'
  question   TEXT NOT NULL,    -- 'Что входит в стоимость фундамента?'
  answer     TEXT NOT NULL,    -- полный текст ответа
  sort_order INTEGER DEFAULT 0
);
```

---

### Таблица `bot_sessions` — состояние многошаговых диалогов бота

```sql
CREATE TABLE bot_sessions (
  tg_user_id BIGINT PRIMARY KEY,
  state      TEXT NOT NULL,           -- 'wait_photo' | 'wait_description'
  data       JSONB DEFAULT '{}',      -- временные данные (file_id, etc.)
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes')
);
```

> Нужна для команды `/addphoto`: webhook stateless, сессия хранит промежуточный state между сообщениями. Просроченные строки чистятся фильтром `expires_at > NOW()`.

---

## 3. API — все эндпоинты

### Структура файлов (Vercel)

```
api/
├── lead.js              POST /api/lead
├── prices.js            GET  /api/prices
├── faq.js               GET  /api/faq?step=foundation
├── portfolio.js         GET  /api/portfolio
├── webhook.js           POST /api/webhook
└── admin/
    ├── login.js         POST /api/admin/login
    ├── leads.js         GET  /api/admin/leads
    ├── leads/
    │   └── [id].js      PATCH /api/admin/leads/[id]   ← req.query.id
    ├── prices.js        GET/PUT /api/admin/prices
    ├── portfolio.js     GET  /api/admin/portfolio
    └── portfolio/
        └── [id].js      DELETE /api/admin/portfolio/[id]
```

### Публичные (вызываются из Mini App)

| Метод | URL | Что делает |
|-------|-----|------------|
| `POST` | `/api/lead` | Принять заявку: сохранить в БД, сгенерировать PDF, отправить PDF клиенту, уведомить собственника |
| `GET` | `/api/prices` | Вернуть текущий прайс-лист (JSON) — фронтенд загружает при старте |
| `GET` | `/api/faq?step=foundation` | Вернуть список вопросов-ответов по шагу калькулятора |
| `GET` | `/api/portfolio` | Вернуть список фото портфолио (`is_visible = true`) |
| `POST` | `/api/webhook` | Telegram webhook — обработка команд бота (/addphoto, FAQ-кнопки, /start) |

### Защищённые (только для собственника, веб-панель)

| Метод | URL | Что делает |
|-------|-----|------------|
| `POST` | `/api/admin/login` | Проверить пароль, вернуть JWT-токен |
| `GET` | `/api/admin/leads` | Список всех лидов с пагинацией и фильтрами |
| `PATCH` | `/api/admin/leads/[id]` | Обновить статус лида ('called', 'contract', 'rejected') |
| `GET` | `/api/admin/prices` | Получить текущий прайс |
| `PUT` | `/api/admin/prices` | Сохранить новый прайс (все поля сразу) |
| `GET` | `/api/admin/portfolio` | Все фото включая скрытые |
| `DELETE` | `/api/admin/portfolio/[id]` | Скрыть фото (`is_visible = false`) |

---

## 4. Роли и доступы

| Кто | Что видит | Что может делать |
|-----|-----------|-----------------|
| **Клиент** | Калькулятор, результат, FAQ-ответы, портфолио | Оставить заявку, получить PDF |
| **Собственник (веб-панель)** | Все лиды, история, статусы, прайс, портфолио | Менять цены, менять статусы лидов, добавлять/скрывать фото |
| **Собственник (Telegram-бот)** | Уведомления о новых лидах | Добавлять фото командой /addphoto |

---

## 5. Ключевые флоу

### Флоу 1 — Клиент оставляет заявку

```
1. Клиент заполняет форму (имя + телефон) → POST /api/lead
2. Vercel Function (лимит: 10 сек Hobby / 60 сек Pro):
   a. Валидирует поля (имя ≥ 2 симв., телефон 11 цифр)
   b. Сохраняет лид в таблицу leads (Supabase)
   c. Генерирует PDF программно через PDFKit
   d. Загружает PDF в Supabase Storage
   e. Отправляет PDF клиенту через Telegram Bot API (sendDocument)
   f. Удаляет PDF из Storage (очистка, файл уже доставлен)
   g. Отправляет уведомление собственнику (sendMessage с текстом лида)
   h. Помечает lead.pdf_sent = true, manager_notified = true
3. Возвращает { ok: true } → фронтенд показывает экран «Спасибо»
```

> ⚠️ **Таймаут:** Шаги b–g — 5+ HTTP-запросов. На Hobby-плане Vercel лимит 10 секунд.
> При превышении: перенести шаги e–h в отдельную фоновую функцию, которую `/api/lead` триггерит через `fetch` без `await` (fire-and-forget).

> ⚠️ **Дубли:** Один клиент может подать несколько заявок — это нормально. Индекс по `phone` позволяет собственнику найти их в панели. Полный дедуп не нужен.

---

### Флоу 2 — Клиент нажимает «Что входит в фундамент?»

```
1. Клиент в Mini App нажимает кнопку «Узнать подробнее» на шаге фундамента
2. Открывается экран консультанта с кнопками-вопросами:
   - «Что входит в стоимость?»
   - «Какой фундамент выбрать?»
   - «Сколько времени занимает?»
3. Тап по вопросу → GET /api/faq?step=foundation → возвращает список { question, answer }
4. Ответ показывается прямо в Mini App (не в чате бота)
```

---

### Флоу 3 — Собственник добавляет фото через Telegram

```
1. Собственник пишет боту: /addphoto
2. Бот отвечает: «Пришлите фото»
   → webhook.js сохраняет в bot_sessions: { tg_user_id, state: 'wait_photo', data: {}, expires_at: +10мин }
3. Собственник присылает фото
   → webhook.js: проверяет bot_sessions WHERE tg_user_id AND state = 'wait_photo' AND expires_at > NOW()
   → обновляет bot_sessions: { state: 'wait_description', data: { file_id: '...' } }
   → бот отвечает: «Введите описание (например: Дом 120 м² в Калуге, классика)»
4. Собственник вводит описание
   → webhook.js: проверяет bot_sessions WHERE state = 'wait_description'
   → скачивает фото через Telegram File API по сохранённому file_id
   → загружает в Supabase Storage → получает публичный URL
   → сохраняет запись в таблицу portfolio
   → удаляет строку из bot_sessions
   → бот отвечает: «✅ Фото добавлено»

Безопасность: принимать /addphoto только от TELEGRAM_OWNER_ID (проверка в webhook.js).
```

---

### Флоу 4 — Собственник меняет цены через веб-панель

```
1. Заходит на /admin/index.html, вводит пароль
2. POST /api/admin/login → проверяет ADMIN_PASSWORD → возвращает JWT
3. Видит таблицу всех цен (GET /api/admin/prices → WHERE id = 'current')
4. Меняет нужные значения, нажимает «Сохранить»
5. PUT /api/admin/prices → UPDATE prices SET ... WHERE id = 'current'
6. Каждое изменённое поле записывается в prices_history
7. Mini App при следующем открытии загрузит свежие цены через GET /api/prices
```

---

## 6. PDF-смета — что внутри

Генерируется на Vercel Function с помощью **PDFKit** (Node.js библиотека, ~3 MB).
PDFKit — программная генерация: текст и линии рисуются кодом, не из HTML-шаблона.

```js
// Пример структуры генерации
const doc = new PDFDocument({ size: 'A4', margin: 50 });
doc.fontSize(20).text('РАСЧЁТ СТОИМОСТИ СТРОИТЕЛЬСТВА', { align: 'center' });
doc.fontSize(12).text(`Клиент: ${lead.name}`);
doc.text(`Площадь: ${lead.area} м²  ·  Регион: ${regionLabel}`);
// ... строки сметы по этапам ...
doc.text(`ИТОГО: ${formatMoney(lead.total)} ₽`, { bold: true });
```

**Структура документа:**
```
┌─────────────────────────────────────────┐
│  [Логотип компании]     СтройДом        │
│  Калужская / Московская обл.            │
├─────────────────────────────────────────┤
│  РАСЧЁТ СТОИМОСТИ СТРОИТЕЛЬСТВА         │
│  Дата: 26.05.2026                       │
│  Клиент: Алексей                        │
├─────────────────────────────────────────┤
│  ПАРАМЕТРЫ ДОМА                         │
│  Площадь: 120 м²  ·  1.5 этажа         │
│  Регион: Калужская обл.                 │
│  Стиль: Классика                        │
├─────────────────────────────────────────┤
│  СМЕТА ПО ЭТАПАМ                        │
│  1. Устройство фундамента  480 000 ₽   │
│  2. Возведение стен        2 640 000 ₽ │
│  3. Устройство кровли      320 000 ₽   │
│  4. Устройство фасада      360 000 ₽   │
│  5. Отделка Вайт Бокс      —           │
│  6. Чистовая отделка       840 000 ₽   │
│  Доп. опции (терраса)      200 000 ₽   │
├─────────────────────────────────────────┤
│  ИТОГО:          ≈ 4 840 000 ₽         │
│  Стоимость за м²: 40 333 ₽/м²          │
│  Точность расчёта: ±10–15%             │
├─────────────────────────────────────────┤
│  Ипотека 6% · 20 лет: от 34 600/мес   │
├─────────────────────────────────────────┤
│  Для уточнения сметы:                   │
│  +7 (XXX) XXX-XX-XX                     │
│  Telegram: @Kalkulator_stroy_bot        │
│                                         │
│  * Расчёт ориентировочный. Точная       │
│    стоимость определяется после выезда  │
│    специалиста на участок.             │
└─────────────────────────────────────────┘
```

> PDF загружается в Supabase Storage, отправляется клиенту через `sendDocument`, затем **удаляется из Storage** — файл временный, не нужен после доставки.

---

## 7. Шаги расчёта (обновлённые)

Вместо «стиль + отделка» — 6 строительных этапов:

| Шаг | Название | Что входит |
|-----|----------|-----------|
| 1 | Устройство фундамента | Свайный / ленточный / монолит / УШП |
| 2 | Возведение стен | Газобетон, коробка, перекрытия |
| 3 | Устройство кровли | Материал + форма |
| 4 | Устройство фасада | Штукатурка / облицовочный кирпич / фасадная панель / без фасада |
| 5 | Отделка Вайт Бокс | Стяжка, штукатурка, разводка инженерии (в `finishing = 'whitebox'`) |
| 6 | Чистовая отделка | Под ключ Эконом / Стандарт / без отделки |

Регион выбирается **на стартовом экране** (до шагов 1–6).

---

## 8. Технологический стек

| Компонент | Технология | Почему |
|-----------|-----------|--------|
| Serverless функции | Vercel Functions (Node.js 20) | Уже задеплоено, бесплатный Hobby-план |
| База данных | Supabase PostgreSQL | Бесплатный тариф 500MB, SQL, готовый REST API |
| Хранилище фото | Supabase Storage | 1GB бесплатно, публичные URL |
| PDF генерация | PDFKit (npm) | Работает в Node.js, ~3MB, без внешних сервисов |
| Аутентификация веб-панели | JWT (jsonwebtoken) + пароль в env | Просто, надёжно для одного пользователя |
| Веб-панель фронтенд | Чистый HTML + CSS (один файл) | Без сборки, деплоится вместе с приложением |
| Telegram | Bot API (https запросы) | Уже используется |

---

## 9. Примеры запросов и ответов

### POST /api/lead

**Запрос:**
```json
{
  "name": "Алексей",
  "phone": "79161234567",
  "tg_user_id": 123456789,
  "region": "kaluga",
  "area": 120,
  "floors": "mansard",
  "foundation": "strip",
  "roof_material": "metalTile",
  "roof_shape": "gable",
  "facade": "plaster",
  "finishing": "turnkeyEco",
  "style": "classic",
  "options": ["terrace"],
  "total": 4840000
}
```

**Ответ (200):**
```json
{ "ok": true }
```

**Ответ (400):**
```json
{ "error": "name and phone are required" }
```

---

### GET /api/prices

**Ответ (200):**
```json
{
  "region_kaluga": 1.00,
  "region_moscow_obl": 1.15,
  "box_single": 22000,
  "foundation_pile": 4000,
  "finishing_whitebox": 14000,
  ...
}
```

---

### GET /api/faq?step=foundation

**Ответ (200):**
```json
[
  { "question": "Что входит в стоимость фундамента?", "answer": "Земляные работы, опалубка, армирование, заливка бетона..." },
  { "question": "Какой фундамент лучше выбрать?", "answer": "Для газобетона чаще всего выбирают ленточный или УШП..." }
]
```

---

### PATCH /api/admin/leads/[id]

**Заголовок:** `Authorization: Bearer <jwt>`

**Запрос:**
```json
{ "status": "called" }
```

**Ответ (200):**
```json
{ "ok": true }
```

---

### PUT /api/admin/prices

**Заголовок:** `Authorization: Bearer <jwt>`

**Запрос:** весь объект цен (все поля таблицы `prices`, кроме `id`, `updated_at`, `updated_by`).

**Ответ (200):**
```json
{ "ok": true }
```

---

## 10. Переменные окружения (Vercel Dashboard → Settings → Environment Variables)

```
TELEGRAM_BOT_TOKEN       — токен бота из BotFather
TELEGRAM_CHAT_ID         — chat_id собственника (уведомления о лидах)
TELEGRAM_OWNER_ID        — telegram user_id собственника (для /addphoto команды)
TELEGRAM_WEBHOOK_SECRET  — секрет для валидации Telegram webhook запросов
SUPABASE_URL             — URL проекта Supabase
SUPABASE_SERVICE_KEY     — service_role ключ (только на бэкенде, никогда во фронтенде!)
ADMIN_PASSWORD           — пароль для входа в веб-панель
ADMIN_JWT_SECRET         — секрет для подписи JWT токенов
```

> `SUPABASE_SERVICE_KEY` и `TELEGRAM_BOT_TOKEN` — секреты. Никогда не попадают в frontend-код и не коммитятся в git.

---

## 11. Безопасность Telegram webhook

При регистрации webhook через Telegram API передать параметр `secret_token`:

```
POST https://api.telegram.org/bot<TOKEN>/setWebhook
  url: https://your-app.vercel.app/api/webhook
  secret_token: <TELEGRAM_WEBHOOK_SECRET>
```

В `api/webhook.js` проверять заголовок перед обработкой:

```js
const secret = req.headers['x-telegram-bot-api-secret-token'];
if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

---

## 12. Порядок разработки (этапы)

### Этап 1 — База и лиды (приоритет: высокий)
1. Зарегистрировать Supabase, создать таблицы `leads`, `prices` (одна строка `id='current'`)
2. Переписать `api/lead.js` — добавить сохранение в Supabase
3. Добавить `GET /api/prices` — фронтенд загружает цены из БД вместо `prices.js`
4. Добавить регион как первый шаг в калькуляторе (выбор из 4 вариантов)
5. Добавить региональный коэффициент в формулу расчёта

### Этап 2 — PDF (приоритет: высокий)
1. Установить PDFKit: `npm install pdfkit`
2. В `api/lead.js`: сгенерировать PDF программно → загрузить в Supabase Storage → отправить клиенту через `sendDocument` → удалить из Storage

### Этап 3 — Новые шаги расчёта (приоритет: высокий)
1. Добавить шаг «Фасад» в калькулятор (экран + цены в БД)
2. Добавить «Вайт Бокс» как уровень отделки (`finishing = 'whitebox'`)
3. Обновить PDF-шаблон под 6 этапов

### Этап 4 — Веб-панель собственника (приоритет: средний)
1. `tg-app/admin/index.html` — форма логина, `POST /api/admin/login`
2. Раздел «Лиды» — таблица со статусами, фильтр по дате/региону, `PATCH /api/admin/leads/[id]`
3. Раздел «Цены» — форма редактирования, `PUT /api/admin/prices`
4. Раздел «Портфолио» — список фото с возможностью скрыть

### Этап 5 — Telegram-бот консультант (приоритет: средний)
1. Создать таблицы `faq` и `bot_sessions` в Supabase
2. `api/webhook.js` — обработка /start, /addphoto, callback-кнопок FAQ
3. Зарегистрировать webhook с `secret_token` (см. Раздел 11)
4. `GET /api/faq?step=X` — кнопка «Узнать подробнее» на каждом шаге

### Этап 6 — Портфолио в Mini App (приоритет: низкий)
1. `GET /api/portfolio` → вернуть фото
2. Экран «Наши объекты» в Mini App

---

## 13. Что НЕ делаем (за скоупом)

| Что | Почему |
|-----|--------|
| CRM-интеграция (AmoCRM / Битрикс) | Статусы лидов в своей БД достаточно на старте |
| GPT-консультант | FAQ-кнопки надёжнее и бесплатны |
| Push-уведомления через 2-3 дня (follow-up) | Добавить в Этап 7 после запуска |
| Сравнение двух конфигураций | После валидации спроса |
| Авторизация для клиента (история расчётов) | Излишняя сложность |
| Онлайн-оплата | Не нужно для лидогенерации |
| Puppeteer / HTML→PDF | 300MB, превышает лимит Vercel (50MB на функцию) |
