# BACKEND-PLAN.md — Архитектурный план бэкенда

> Документ для разработки бэкенда под ключ.
> Стек: Netlify Functions (Node.js) + Supabase (PostgreSQL + Storage) + Telegram Bot API.

---

## 1. Что строим — обзор системы

```
┌──────────────────────────────────────────────────────────┐
│                  КЛИЕНТ (Telegram)                        │
│  Mini App → выбирает параметры → оставляет телефон        │
└──────────────────────┬───────────────────────────────────┘
                       │ POST /lead
┌──────────────────────▼───────────────────────────────────┐
│              NETLIFY FUNCTIONS (бэкенд)                   │
│  lead.js — принять, сохранить, PDF, уведомить            │
│  prices.js — отдать текущие цены фронтенду               │
│  admin/* — защищённые маршруты для собственника          │
│  webhook.js — обработка команд бота (FAQ, /addphoto)     │
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
               │  /admin (защищена паролем)              │
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
  white_box     BOOLEAN DEFAULT FALSE,  -- Отделка Вайт Бокс
  finishing     TEXT NOT NULL,          -- 'shell' | 'rough' | 'whitebox' | 'turnkeyEco' | 'turnkeyStd'
  style         TEXT NOT NULL,          -- 'classic' | 'hitech' | 'chalet'
  options       TEXT[] DEFAULT '{}',    -- ['terrace', 'garage', 'bathhouse']

  -- Итог расчёта
  total         BIGINT NOT NULL,        -- итоговая сумма в ₽

  -- Статус обработки
  pdf_sent      BOOLEAN DEFAULT FALSE,
  manager_notified BOOLEAN DEFAULT FALSE,
  status        TEXT DEFAULT 'new'      -- 'new' | 'called' | 'contract' | 'rejected'
);
```

### Таблица `prices` — редактируемые цены

```sql
CREATE TABLE prices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  TEXT DEFAULT 'owner',

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
```

> Таблица содержит **одну строку** — текущий прайс. При обновлении цен через веб-панель эта строка обновляется. История изменений — в таблице `prices_history`.

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

### Таблица `faq` — ответы консультанта

```sql
CREATE TABLE faq (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step     TEXT NOT NULL,    -- 'foundation' | 'walls' | 'roof' | 'facade' | 'whitebox' | 'finishing' | 'company' | 'general'
  question TEXT NOT NULL,    -- 'Что входит в стоимость фундамента?'
  answer   TEXT NOT NULL,    -- полный текст ответа
  sort_order INTEGER DEFAULT 0
);
```

---

## 3. API — все эндпоинты

### Публичные (вызываются из Mini App)

| Метод | URL | Что делает |
|-------|-----|------------|
| `POST` | `/.netlify/functions/lead` | Принять заявку: сохранить в БД, сгенерировать PDF, отправить PDF клиенту, уведомить собственника |
| `GET` | `/.netlify/functions/prices` | Вернуть текущий прайс-лист (JSON) — фронтенд загружает при старте |
| `GET` | `/.netlify/functions/portfolio` | Вернуть список фото портфолио (`is_visible = true`) |
| `POST` | `/.netlify/functions/webhook` | Telegram webhook — обработка команд бота (/addphoto, FAQ-кнопки, /start) |

### Защищённые (только для собственника, веб-панель)

| Метод | URL | Что делает |
|-------|-----|------------|
| `POST` | `/.netlify/functions/admin/login` | Проверить пароль, вернуть JWT-токен |
| `GET` | `/.netlify/functions/admin/leads` | Список всех лидов с пагинацией и фильтрами |
| `PATCH` | `/.netlify/functions/admin/leads/:id` | Обновить статус лида ('called', 'contract', 'rejected') |
| `GET` | `/.netlify/functions/admin/prices` | Получить текущий прайс |
| `PUT` | `/.netlify/functions/admin/prices` | Сохранить новый прайс (все поля сразу) |
| `GET` | `/.netlify/functions/admin/portfolio` | Все фото включая скрытые |
| `DELETE` | `/.netlify/functions/admin/portfolio/:id` | Скрыть фото (`is_visible = false`) |

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
1. Клиент заполняет форму (имя + телефон) → POST /lead
2. Netlify Function:
   a. Валидирует поля (имя ≥ 2 симв., телефон 11 цифр)
   b. Сохраняет лид в таблицу leads (Supabase)
   c. Генерирует PDF-смету по шаблону (данные из запроса)
   d. Загружает PDF в Supabase Storage (временно)
   e. Отправляет PDF клиенту через Telegram Bot API (sendDocument)
   f. Отправляет уведомление собственнику (sendMessage с кнопками «Позвонил» / «Отказ»)
   g. Помечает lead.pdf_sent = true, manager_notified = true
3. Возвращает { ok: true } → фронтенд показывает экран «Спасибо»
```

### Флоу 2 — Клиент нажимает «Что входит в фундамент?»

```
1. Клиент в Mini App нажимает кнопку «Узнать подробнее» на шаге фундамента
2. Открывается экран консультанта с кнопками-вопросами:
   - «Что входит в стоимость?»
   - «Какой фундамент выбрать?»
   - «Сколько времени занимает?»
3. Тап по вопросу → GET /faq?step=foundation → возвращает текст ответа
4. Ответ показывается прямо в Mini App (не в чате бота)
```

### Флоу 3 — Собственник добавляет фото через Telegram

```
1. Собственник пишет боту: /addphoto
2. Бот отвечает: «Пришлите фото»
3. Собственник присылает фото
4. Бот отвечает: «Введите описание (например: Дом 120 м² в Калуге, классика)»
5. Собственник вводит описание
6. Netlify Function (webhook):
   a. Скачивает фото через Telegram File API
   b. Загружает в Supabase Storage → получает публичный URL
   c. Сохраняет запись в таблицу portfolio
7. Бот отвечает: «✅ Фото добавлено»
```

### Флоу 4 — Собственник меняет цены через веб-панель

```
1. Заходит на /admin, вводит пароль
2. Видит таблицу всех цен (загружается через GET /admin/prices)
3. Меняет нужные значения
4. Нажимает «Сохранить»
5. PUT /admin/prices → Supabase обновляет строку в таблице prices
6. Каждое изменённое поле записывается в prices_history
7. Mini App при следующем открытии загрузит свежие цены через GET /prices
```

---

## 6. PDF-смета — что внутри

Генерируется на Netlify Function с помощью **PDFKit** (Node.js библиотека).

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
│  🏦 Ипотека 6% · 20 лет: от 34 600/мес│
├─────────────────────────────────────────┤
│  Для уточнения сметы:                   │
│  📞 +7 (XXX) XXX-XX-XX                  │
│  Telegram: @Kalkulator_stroy_bot        │
│                                         │
│  * Расчёт ориентировочный. Точная       │
│    стоимость определяется после выезда  │
│    специалиста на участок.             │
└─────────────────────────────────────────┘
```

---

## 7. Шаги расчёта (обновлённые)

Вместо «стиль + отделка» — 6 строительных этапов:

| Шаг | Название | Что входит |
|-----|----------|-----------|
| 1 | Устройство фундамента | Свайный / ленточный / монолит / УШП |
| 2 | Возведение стен | Газобетон, коробка, перекрытия |
| 3 | Устройство кровли | Материал + форма |
| 4 | Устройство фасада | Штукатурка / облицовочный кирпич / фасадная панель / без фасада |
| 5 | Отделка Вайт Бокс | Стяжка, штукатурка, разводка инженерии |
| 6 | Чистовая отделка | Под ключ Эконом / Стандарт / без отделки |

Регион выбирается **на стартовом экране** (до шагов).

---

## 8. Технологический стек

| Компонент | Технология | Почему |
|-----------|-----------|--------|
| Serverless функции | Netlify Functions (Node.js 20) | Уже настроено, бесплатно |
| База данных | Supabase PostgreSQL | Бесплатный тариф 500MB, SQL, готовый REST API |
| Хранилище фото | Supabase Storage | 1GB бесплатно, публичные URL |
| PDF генерация | PDFKit (npm) | Работает в Node.js, без внешних сервисов |
| Аутентификация веб-панели | JWT (jsonwebtoken) + пароль в env | Просто, надёжно для одного пользователя |
| Веб-панель фронтенд | Чистый HTML + CSS (один файл) | Без сборки, деплоится вместе с приложением |
| Telegram | Bot API (https запросы) | Уже используется |

---

## 9. Переменные окружения (Netlify Dashboard)

```
TELEGRAM_BOT_TOKEN      — токен бота из BotFather
TELEGRAM_CHAT_ID        — chat_id собственника (уведомления о лидах)
TELEGRAM_OWNER_ID       — telegram user_id собственника (для /addphoto команды)
SUPABASE_URL            — URL проекта Supabase
SUPABASE_SERVICE_KEY    — service_role ключ (только на бэкенде, никогда во фронтенде)
ADMIN_PASSWORD          — пароль для входа в веб-панель
ADMIN_JWT_SECRET        — секрет для подписи JWT токенов
```

---

## 10. Порядок разработки (этапы)

### Этап 1 — База и лиды (приоритет: высокий)
1. Зарегистрировать Supabase, создать таблицы `leads`, `prices` (одна строка с ценами)
2. Перенести `/.netlify/functions/lead` — добавить сохранение в Supabase
3. Добавить `GET /prices` — фронтенд загружает цены из БД вместо `prices.js`
4. Добавить регион как первый шаг в калькуляторе (выбор из 4 вариантов)
5. Добавить региональный коэффициент в формулу расчёта

### Этап 2 — PDF (приоритет: высокий)
1. Установить PDFKit, создать HTML-шаблон сметы
2. В функции `/lead`: генерировать PDF → загружать в Supabase Storage → отправлять клиенту

### Этап 3 — Новые шаги расчёта (приоритет: высокий)
1. Добавить шаг «Фасад» в калькулятор (экран + цены в БД)
2. Добавить «Вайт Бокс» как отдельный уровень отделки
3. Обновить PDF-шаблон под 6 этапов

### Этап 4 — Веб-панель собственника (приоритет: средний)
1. Страница `/admin/index.html` — форма логина (пароль)
2. Раздел «Лиды» — таблица со статусами, фильтром по дате/региону
3. Раздел «Цены» — форма редактирования всех цен
4. Раздел «Портфолио» — список фото с возможностью скрыть

### Этап 5 — Telegram-бот консультант (приоритет: средний)
1. Webhook на Netlify (`/webhook`)
2. Зарегистрировать FAQ в таблице `faq` (6 шагов × 3 вопроса = 18 записей)
3. Кнопка «Узнать подробнее» на каждом шаге в Mini App
4. Команда `/addphoto` для собственника

### Этап 6 — Портфолио в Mini App (приоритет: низкий)
1. `GET /portfolio` → вернуть фото
2. Экран «Наши объекты» в Mini App (между экраном «Спасибо» и кнопкой «Смотреть проекты»)

---

## 11. Что НЕ делаем (за скоупом)

| Что | Почему |
|-----|--------|
| CRM-интеграция (AmoCRM / Битрикс) | Статусы лидов в своей БД достаточно на старте |
| GPT-консультант | FAQ-кнопки надёжнее и бесплатны |
| Push-уведомления через 2-3 дня (follow-up) | Добавить в Этап 7 после запуска |
| Сравнение двух конфигураций | После валидации спроса |
| Авторизация для клиента (история расчётов) | Излишняя сложность |
| Онлайн-оплата | Не нужно для лидогенерации |
