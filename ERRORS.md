# ERRORS.md — Журнал ошибок и исправлений

> Формат записи: `[YYYYMMDD-NNN]` → симптом → причина → решение → статус.
> Статусы: 🔴 Открыта | 🟡 В работе | ✅ Закрыта | ⚠️ Ожидает деплоя

---

## Шаблон новой записи

```
## [YYYYMMDD-001] Компонент — Краткое описание
- **Симптом:** что видит пользователь / что падает в логах
- **Причина:** корневая причина
- **Решение:** конкретные шаги исправления
- **Файлы:** список изменённых файлов
- **Статус:** 🔴 Открыта
```

---

## Раздел A — ENV / Конфигурация

### [ENV-001] api/lead.js — 500 при отправке формы
- **Симптом:** форма screen-8 зависает, в Vercel Logs: `Missing env: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID`
- **Причина:** переменные окружения не заданы в Vercel Dashboard
- **Решение:**
  1. Vercel Dashboard → Project → Settings → Environment Variables
  2. Добавить `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`
  3. Redeploy (меняется только env, код можно не трогать)
- **Как узнать CHAT_ID:** написать боту `/start`, затем открыть `https://api.telegram.org/bot<TOKEN>/getUpdates` → найти `"chat":{"id":...}`
- **Файлы:** только env vars, код не меняется
- **Статус:** ⚠️ Ожидает настройки

### [ENV-002] api/admin/login.js — 500 при входе в панель
- **Симптом:** форма входа на `/admin/` возвращает "Not configured"
- **Причина:** `ADMIN_PASSWORD` и/или `JWT_SECRET` не заданы
- **Решение:**
  1. Добавить `ADMIN_PASSWORD` (придумать сложный пароль)
  2. Добавить `JWT_SECRET` (минимум 32 случайных символа, например: `openssl rand -hex 32`)
- **Статус:** ⚠️ Ожидает настройки

### [ENV-003] api/webhook.js — 403 на все webhook-запросы
- **Симптом:** Telegram не доставляет события, webhook возвращает 403
- **Причина:** `TELEGRAM_WEBHOOK_SECRET` задан в Dashboard, но webhook зарегистрирован без него
- **Решение:** при регистрации webhook добавить `&secret_token=<значение>`
  ```bash
  curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
    -d "url=https://ВАШ-САЙТ.vercel.app/api/webhook" \
    -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
  ```
- **Статус:** ⚠️ Ожидает настройки

### [ENV-004] Supabase — функции работают без БД, лиды не сохраняются
- **Симптом:** уведомление в Telegram приходит, но лид не виден в панели `/admin/`
- **Причина:** `SUPABASE_URL` или `SUPABASE_SERVICE_KEY` не заданы → `getSupabase()` возвращает `null`
- **Решение:**
  1. Создать проект на [supabase.com](https://supabase.com)
  2. Запустить `supabase/migrations/001_init.sql` в SQL Editor
  3. Создать bucket `pdfs` (Storage → Buckets → New bucket, Public)
  4. Добавить env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- **Статус:** ⚠️ Ожидает настройки

---

## Раздел B — API / Vercel Functions

### [API-001] api/lead.js — PDF не генерируется, `pdfUrl: null`
- **Симптом:** на screen-9 не появляется кнопка «Скачать смету PDF»
- **Причина 1:** Supabase не настроен (см. ENV-004)
- **Причина 2:** bucket `pdfs` не создан или не публичный
- **Причина 3:** PDFKit падает — нет `node_modules` (зависимости не установлены)
- **Решение:** проверить Vercel Logs → Function Logs на наличие `PDF generation/upload error:...`
  - Если `Cannot find module 'pdfkit'` → в `package.json` есть запись, но Vercel не установил. Попробовать `vercel deploy --force`.
  - Если ошибка Storage → убедиться что bucket `pdfs` существует и `Public`
- **Файлы:** `api/pdf-template.js`, `package.json`
- **Статус:** 🔴 Открыта (требует тестирования после настройки Supabase)

### [API-002] api/prices.js — фронтенд загружает жёсткие цены вместо БД
- **Симптом:** изменение цен через `/admin/` не отражается в калькуляторе
- **Причина:** Supabase не настроен → `/api/prices` возвращает `FALLBACK_PRICES`
- **Диагностика:** `curl https://ВАШ-САЙТ.vercel.app/api/prices` → проверить поле `source` в ответе (`"db"` или `"fallback"`)
- **Решение:** настроить Supabase (см. ENV-004), цены из таблицы `prices` подтянутся автоматически
- **Файлы:** `api/prices.js`, `tg-app/js/prices.js` (fallback)
- **Статус:** ⚠️ Ожидает Supabase

### [API-003] Vercel rewrite перехватывает API-маршруты
- **Симптом:** `/api/lead` или другие API возвращают HTML вместо JSON
- **Причина:** некорректный `source` в `vercel.json`
- **Решение:** убедиться, что `vercel.json` содержит именно:
  ```json
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
  ```
  Слэш `/` перед `((?!api/)` критичен.
- **Файлы:** `vercel.json`
- **Статус:** ✅ Закрыта (настроено в текущей версии)

### [API-004] api/webhook.js — webhook не зарегистрирован, бот не отвечает
- **Симптом:** бот молчит на `/start` и на инлайн-кнопки FAQ
- **Причина:** `setWebhook` ни разу не вызывался после деплоя
- **Решение:**
  ```bash
  curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
    -d "url=https://ВАШ-САЙТ.vercel.app/api/webhook"
  # Проверить:
  curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
  ```
- **Статус:** ⚠️ Ожидает настройки (один раз после деплоя)

### [API-005] api/admin/leads/[id].js — 404 на PATCH запрос
- **Симптом:** при смене статуса лида в панели получаем 404
- **Причина:** Vercel не распознаёт `[id]` в пути `api/admin/leads/[id].js` при локальной разработке
- **Диагностика:** проверить в продакшене — Vercel поддерживает `[param]`-синтаксис, локально (`vercel dev`) тоже должен работать
- **Решение:** если проблема в продакшене — проверить путь файла, он должен быть `api/admin/leads/[id].js` (именно квадратные скобки)
- **Файлы:** `api/admin/leads/[id].js`
- **Статус:** 🔴 Открыта (требует тестирования)

---

## Раздел C — Frontend / Mini App

### [FE-001] Калькулятор не переходит на следующий экран
- **Симптом:** нажатие «Продолжить» ничего не делает
- **Причина:** `appState.currentStep` не соответствует индексу в `SCREEN_ORDER`
- **Диагностика:** в консоли браузера: `window.appState` → проверить `currentStep`
- **Решение:** проверить `SCREEN_ORDER` в `app.js` — все 12 ID должны совпадать с `id` в `index.html`
  ```
  'screen-0', 'screen-region', 'screen-1', 'screen-2', 'screen-3',
  'screen-4', 'screen-facade', 'screen-5', 'screen-6',
  'screen-7', 'screen-8', 'screen-9'
  ```
- **Файлы:** `tg-app/js/app.js`, `tg-app/index.html`
- **Статус:** ✅ Закрыта

### [FE-002] Тёмная тема не применяется
- **Симптом:** в Telegram (тёмная тема) интерфейс остаётся светлым
- **Причина:** `tgApp.colorScheme` не читается или `dark-theme` класс не добавляется
- **Диагностика:** открыть в браузере с `?theme=dark` в URL, проверить `document.body.classList`
- **Решение:** в `app.js` найти блок применения `dark-theme`, убедиться что выполняется после `tgApp.ready()`
- **Файлы:** `tg-app/js/app.js`, `tg-app/css/app.css`
- **Статус:** 🔴 Открыта (требует тестирования в Telegram)

### [FE-003] Кнопка «Скачать смету PDF» не появляется
- **Симптом:** после отправки формы screen-9 показывается без кнопки скачивания
- **Причина 1:** `pdfUrl` не вернулся из `/api/lead` (Supabase не настроен)
- **Причина 2:** `#pdf-download-btn` скрыт по CSS и JS его не показывает
- **Диагностика:** в консоли: `document.getElementById('pdf-download-btn')` → проверить `style.display`
- **Файлы:** `tg-app/js/app.js` (блок `if (json.pdfUrl)`), `tg-app/index.html`
- **Статус:** ⚠️ Ожидает Supabase

### [FE-004] Ошибка «PRICES is not defined»
- **Симптом:** белый экран при открытии калькулятора
- **Причина:** `prices.js` не подключён до `calculator.js` в `index.html`
- **Решение:** в `index.html` проверить порядок `<script>`:
  ```html
  <script src="js/prices.js"></script>
  <script src="js/calculator.js"></script>
  <script src="js/app.js"></script>
  ```
- **Файлы:** `tg-app/index.html`
- **Статус:** ✅ Закрыта

### [FE-005] Региональный коэффициент не применяется в расчёте
- **Симптом:** Московская обл. и Калуга дают одинаковую цену
- **Причина:** `state.region` не передаётся в `calculate(state)` или отсутствует в `PRICES.region`
- **Диагностика:** `calculate({ area: 100, floors: 'single', ..., region: 'moscow_obl' })` — проверить `breakdown.region`
- **Файлы:** `tg-app/js/calculator.js`, `tg-app/js/prices.js`
- **Статус:** ✅ Закрыта

---

## Раздел D — Admin Panel

### [ADM-001] Вход в панель — «Wrong password»
- **Симптом:** правильный пароль не принимается
- **Причина 1:** `ADMIN_PASSWORD` в Vercel Dashboard содержит лишние пробелы
- **Причина 2:** браузер авто-подставил другой пароль из менеджера
- **Решение:** скопировать точное значение переменной из Vercel Dashboard и вручную ввести в форму
- **Статус:** 🔴 Открыта (требует тестирования)

### [ADM-002] Сессия истекает через 8 часов, панель просит войти снова
- **Симптом:** через некоторое время все запросы возвращают 401
- **Причина:** JWT-токен истекает через 8 часов (настроено в `api/_jwt.js`)
- **Решение:** это ожидаемое поведение — просто войти снова. Если нужна более долгая сессия — изменить `expiresIn: '8h'` в `_jwt.js`
- **Файлы:** `api/_jwt.js`
- **Статус:** ✅ Закрыта (ожидаемое поведение)

### [ADM-003] Таблица лидов пустая, счётчики 0
- **Симптом:** панель `/admin/` открывается, но нет данных
- **Причина 1:** Supabase не настроен
- **Причина 2:** лиды сохраняются, но `manager_notified` фильтр (если был) исключает их
- **Диагностика:** открыть DevTools → Network → проверить ответ `/api/admin/leads`
- **Статус:** ⚠️ Ожидает Supabase

---

## Раздел E — Supabase / База данных

### [DB-001] Ошибка RLS: «permission denied for table leads»
- **Симптом:** Supabase операции падают с ошибкой доступа
- **Причина:** используется `anon` key вместо `service_role` key
- **Решение:** в Vercel Dashboard убедиться, что `SUPABASE_SERVICE_KEY` — это именно **service_role** ключ (не `anon`). Supabase Dashboard → Settings → API → service_role key
- **Статус:** ⚠️ Ожидает настройки

### [DB-002] Таблицы не существуют («relation does not exist»)
- **Симптом:** любой INSERT/SELECT падает с ошибкой отсутствия таблицы
- **Причина:** миграция не была запущена
- **Решение:** в Supabase SQL Editor запустить `supabase/migrations/001_init.sql` целиком
- **Файлы:** `supabase/migrations/001_init.sql`
- **Статус:** ⚠️ Ожидает настройки

### [DB-003] Storage bucket `pdfs` не найден
- **Симптом:** в Vercel Logs: `PDF generation/upload error: Bucket not found`
- **Причина:** bucket не создан вручную в Supabase Dashboard
- **Решение:** Supabase Dashboard → Storage → New bucket → Name: `pdfs`, Public: включить
- **Статус:** ⚠️ Ожидает настройки

---

## Раздел F — Telegram Bot

### [TG-001] Бот не может написать пользователю (PDF через Telegram не работает)
- **Симптом:** попытка `sendDocument` пользователю → `403: bot can't initiate conversation`
- **Причина:** Telegram запрещает боту писать пользователю, который не начал диалог с ботом
- **Решение:** PDF отправляется как ссылка на экране screen-9, НЕ через Telegram. Реализовано через Supabase Storage public URL.
- **Статус:** ✅ Закрыта (архитектурное решение принято)

### [TG-002] Форматирование Markdown в сообщении сломано
- **Симптом:** в Telegram сообщении видны символы `*`, `_` вместо форматирования
- **Причина:** специальные символы в имени/телефоне клиента интерпретируются как Markdown
- **Решение:** экранировать пользовательские поля или использовать `parse_mode: 'HTML'` вместо `'Markdown'`
- **Файлы:** `api/lead.js` (функция `buildMessage`)
- **Статус:** 🔴 Открыта (требует исправления при появлении)

---

## Контрольные команды для диагностики

```bash
# Проверить webhook статус
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Проверить API prices
curl "https://ВАШ-САЙТ.vercel.app/api/prices"

# Проверить API lead (тест)
curl -X POST "https://ВАШ-САЙТ.vercel.app/api/lead" \
  -H "Content-Type: application/json" \
  -d '{"name":"Тест","phone":"+7900000000","region":"kaluga","area":100,"floors":"single","foundation":"pile","roofMaterial":"metalTile","roofShape":"gable","style":"classic","facade":"plaster","finishing":"rough","options":[],"total":3000000}'

# Проверить логи Vercel (через CLI)
vercel logs --follow
```

---

## Порядок первичной настройки (чеклист)

- [ ] `TELEGRAM_BOT_TOKEN` — задан в Vercel Dashboard
- [ ] `TELEGRAM_CHAT_ID` — задан в Vercel Dashboard (см. ENV-001)
- [ ] Supabase проект создан, миграция запущена (см. DB-002)
- [ ] Bucket `pdfs` создан и публичный (см. DB-003)
- [ ] `SUPABASE_URL` и `SUPABASE_SERVICE_KEY` — заданы в Vercel Dashboard (service_role, см. DB-001)
- [ ] `ADMIN_PASSWORD` и `JWT_SECRET` — заданы в Vercel Dashboard (см. ENV-002)
- [ ] `TELEGRAM_OWNER_ID` — Telegram user ID собственника (для `/addphoto`)
- [ ] `TELEGRAM_WEBHOOK_SECRET` — любая строка (задаётся одновременно в Vercel и при регистрации webhook)
- [ ] Webhook зарегистрирован (см. API-004 и ENV-003)
- [ ] Тестовая заявка отправлена и получена в Telegram
