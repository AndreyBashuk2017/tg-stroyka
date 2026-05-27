# DEPLOYMENT.md — Деплой с нуля до запуска

Инструкция для развёртывания проекта на новом аккаунте или при переносе.
Время: ~2 часа при первом деплое.

---

## Обзор шагов

| Шаг | Что делаем | Время |
|-----|------------|-------|
| 1 | Подготовка репозитория | 5 мин |
| 2 | Telegram — создать бота | 10 мин |
| 3 | Supabase — создать БД | 20 мин |
| 4 | Vercel — задеплоить проект | 15 мин |
| 5 | Vercel — задать env vars | 10 мин |
| 6 | Telegram — зарегистрировать webhook | 5 мин |
| 7 | Telegram — подключить Mini App к боту | 5 мин |
| 8 | Проверка | 10 мин |

---

## Что нужно заранее

- Аккаунт GitHub (репозиторий уже там)
- Аккаунт Vercel — [vercel.com](https://vercel.com) (бесплатный Hobby-план)
- Аккаунт Supabase — [supabase.com](https://supabase.com) (бесплатный тариф)
- Telegram-аккаунт для работы с BotFather

---

## Шаг 1 — Подготовка репозитория

```bash
git clone <repo-url>
cd tg-stroyka

# Установить зависимости (PDFKit, Supabase client, JWT)
npm install

# Создать .env для локальной разработки
cp .env.example .env
# Заполнить переменные по мере прохождения шагов ниже
```

---

## Шаг 2 — Telegram: создать бота

### 2.1 Создать бота через BotFather

1. Открыть Telegram → найти `@BotFather`
2. Отправить `/newbot`
3. Ввести имя бота (например: `СтройДом Калькулятор`)
4. Ввести username (например: `Kalkulator_stroy_bot`)
5. Скопировать токен — это `TELEGRAM_BOT_TOKEN`

### 2.2 Получить свой CHAT_ID

1. Написать боту `/start`
2. Открыть в браузере:
   ```
   https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates
   ```
3. Найти в ответе `"chat":{"id":XXXXXXXXX}` — это `TELEGRAM_CHAT_ID`

### 2.3 Получить свой USER_ID

1. Написать боту `@userinfobot` → `/start`
2. Он ответит вашим `id` — это `TELEGRAM_OWNER_ID`

### 2.4 Записать в .env

```
TELEGRAM_BOT_TOKEN=1234567890:AABBccDD...
TELEGRAM_CHAT_ID=123456789
TELEGRAM_OWNER_ID=123456789
```

---

## Шаг 3 — Supabase: создать базу данных

### 3.1 Создать проект

1. Зайти на [supabase.com](https://supabase.com) → New Project
2. Название: `tg-stroyka`
3. Придумать пароль БД (сохранить, понадобится при миграции)
4. Регион: EU (Frankfurt) — ближайший к России

### 3.2 Запустить миграцию

1. В Supabase Dashboard → SQL Editor → New query
2. Открыть файл `supabase/migrations/001_init.sql`
3. Вставить содержимое и нажать **Run**
4. Убедиться, что нет ошибок — должны создаться таблицы: `leads`, `prices`, `prices_history`, `portfolio`, `faq`, `bot_sessions`

### 3.3 Создать Storage bucket для PDF

1. Supabase Dashboard → Storage → New bucket
2. **Name:** `pdfs`
3. **Public bucket:** включить ✅
4. Нажать Create bucket

### 3.4 Скопировать ключи

1. Supabase Dashboard → Settings → API
2. Скопировать:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** (Secret) → `SUPABASE_SERVICE_KEY`

> ⚠️ Копировать именно `service_role`, не `anon`. Разница: `anon` не имеет доступа из-за RLS.

### 3.5 Записать в .env

```
SUPABASE_URL=https://xxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Шаг 4 — Vercel: задеплоить проект

### 4.1 Подключить репозиторий

1. Зайти на [vercel.com](https://vercel.com) → Add New Project
2. Импортировать репозиторий с GitHub
3. **Framework Preset:** Other
4. **Root Directory:** оставить пустым (`.`)
5. Нажать Deploy

Vercel сам прочитает `vercel.json`:
```json
{
  "outputDirectory": "tg-app",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

После деплоя получить URL вида `https://tg-stroyka-xxx.vercel.app` — это адрес сайта.

---

## Шаг 5 — Vercel: задать переменные окружения

Vercel Dashboard → Project → Settings → Environment Variables

Добавить все 8 переменных:

| Переменная | Значение | Где брать |
|------------|----------|-----------|
| `TELEGRAM_BOT_TOKEN` | токен бота | BotFather (шаг 2.1) |
| `TELEGRAM_CHAT_ID` | chat_id собственника | getUpdates (шаг 2.2) |
| `TELEGRAM_OWNER_ID` | user_id собственника | @userinfobot (шаг 2.3) |
| `TELEGRAM_WEBHOOK_SECRET` | любая строка-секрет | придумать, например UUID |
| `SUPABASE_URL` | URL проекта | Supabase Dashboard (шаг 3.4) |
| `SUPABASE_SERVICE_KEY` | service_role ключ | Supabase Dashboard (шаг 3.4) |
| `ADMIN_PASSWORD` | пароль для /admin/ | придумать сложный |
| `JWT_SECRET` | строка ≥32 символа | сгенерировать (см. ниже) |

**Генерация JWT_SECRET:**
```bash
# В терминале (macOS/Linux):
openssl rand -hex 32
# Пример вывода: a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

После добавления всех переменных — нажать **Redeploy** (Settings → Deployments → Redeploy).

---

## Шаг 6 — Telegram: зарегистрировать webhook

Выполнить один раз в терминале (подставить реальные значения):

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://ВАШ-САЙТ.vercel.app/api/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

**Проверить что webhook установлен:**
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

Ожидаемый ответ:
```json
{
  "ok": true,
  "result": {
    "url": "https://ВАШ-САЙТ.vercel.app/api/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

---

## Шаг 7 — Telegram: подключить Mini App к боту

### 7.1 Установить кнопку меню

В BotFather:
```
/setmenubutton
→ выбрать бота
→ ввести URL: https://ВАШ-САЙТ.vercel.app
→ ввести название кнопки: Рассчитать стоимость
```

### 7.2 Установить описание бота (опционально)

```
/setdescription → текст для нового пользователя
/setabouttext → короткое описание в профиле бота
```

### 7.3 Заменить заглушку канала в коде

В файле `tg-app/js/app.js` найти и заменить:
```js
tgApp.openTelegramLink('https://t.me/yourchannel')
```
На реальную ссылку на Telegram-канал с портфолио.

Затем:
```bash
git commit -am "Set real Telegram channel link"
git push
# Vercel автоматически задеплоит
```

---

## Шаг 8 — Проверка

### 8.1 Проверить API

```bash
# Цены возвращаются (source: "db" если Supabase настроен)
curl https://ВАШ-САЙТ.vercel.app/api/prices

# Тестовый лид
curl -X POST https://ВАШ-САЙТ.vercel.app/api/lead \
  -H "Content-Type: application/json" \
  -d '{"name":"Тест","phone":"+7 (900) 000-00-00","region":"kaluga","area":100,"floors":"single","foundation":"pile","roofMaterial":"metalTile","roofShape":"gable","style":"classic","facade":"none","finishing":"shell","options":[],"total":2600000}'
```

### 8.2 Проверить Mini App

1. Открыть Telegram → найти бота
2. Нажать кнопку «Рассчитать стоимость»
3. Пройти все 12 экранов до конца
4. Заполнить форму на screen-8 → отправить заявку
5. Убедиться что в Telegram пришло уведомление с параметрами

### 8.3 Проверить веб-панель

1. Открыть `https://ВАШ-САЙТ.vercel.app/admin/`
2. Ввести `ADMIN_PASSWORD`
3. Убедиться что тестовый лид из шага 8.2 появился в таблице

### 8.4 Проверить Vercel Logs (при ошибках)

Vercel Dashboard → Project → Functions → выбрать функцию → View logs

---

## Локальная разработка

```bash
# Убедиться что .env заполнен (все 8 переменных)
cat .env

# Запустить локально с поддержкой Serverless Functions
npx vercel dev
# → http://localhost:3000

# Mini App будет работать в браузере.
# Telegram SDK загружается, но initData пустой → режим браузера (синяя кнопка вместо MainButton).
```

---

## Чеклист финального запуска

**Минимум для работы уведомлений:**
- [ ] `TELEGRAM_BOT_TOKEN` задан в Vercel Dashboard
- [ ] `TELEGRAM_CHAT_ID` задан в Vercel Dashboard
- [ ] Кнопка меню установлена через BotFather (`/setmenubutton`)
- [ ] Реальный Telegram-канал вместо заглушки в `app.js`
- [ ] Тестовая заявка отправлена и уведомление получено

**Для полного функционала (БД, PDF, панель):**
- [ ] Supabase проект создан
- [ ] `001_init.sql` выполнен без ошибок
- [ ] Bucket `pdfs` создан (Public)
- [ ] `SUPABASE_URL` и `SUPABASE_SERVICE_KEY` заданы в Vercel
- [ ] `ADMIN_PASSWORD` и `JWT_SECRET` заданы в Vercel
- [ ] Вход в `/admin/` работает
- [ ] Тестовый лид виден в панели + кнопка PDF появляется на screen-9

**Для Telegram-бота (webhook):**
- [ ] `TELEGRAM_OWNER_ID` и `TELEGRAM_WEBHOOK_SECRET` заданы в Vercel
- [ ] Webhook зарегистрирован (шаг 6)
- [ ] `getWebhookInfo` показывает правильный URL без ошибок
- [ ] Бот отвечает на `/start`

---

## Частые проблемы при деплое

| Симптом | Причина | Решение |
|---------|---------|---------|
| Форма возвращает 500 | `TELEGRAM_CHAT_ID` не задан | Задать в Vercel Dashboard → Redeploy |
| PDF-кнопка не появляется | Supabase не настроен или bucket не Public | Проверить bucket settings |
| `/admin/` показывает калькулятор | SPA rewrite перехватывает | Проверить `vercel.json`: `/((?!api/).*)` |
| Бот не отвечает | Webhook не зарегистрирован | Выполнить шаг 6 |
| 403 на webhook | `TELEGRAM_WEBHOOK_SECRET` не совпадает | Задать одинаково в Vercel и при регистрации |
| «permission denied» в Supabase | Используется `anon` ключ вместо `service_role` | Заменить `SUPABASE_SERVICE_KEY` |

Подробнее — в [ERRORS.md](ERRORS.md).
