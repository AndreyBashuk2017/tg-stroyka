# CLAUDE.md — Навигация по проекту

Telegram Mini App — калькулятор стоимости строительства дома из газобетона.
Стек: чистый HTML + CSS + JS, хостинг Vercel, бэкенд — Vercel Serverless Functions (Node.js).

---

## Структура файлов

```
tg-stroyka/
├── tg-app/                          ← публичная папка (outputDirectory для Vercel)
│   ├── index.html                   ← единственная HTML-страница, все 12 экранов
│   ├── css/
│   │   └── app.css                  ← все стили (тема Telegram, карточки, анимации)
│   ├── js/
│   │   ├── prices.js                ← fallback-конфиг цен (живые цены загружаются из Supabase)
│   │   ├── calculator.js            ← логика расчёта, форматирование
│   │   └── app.js                   ← навигация, Telegram SDK, обработчики событий
│   └── admin/
│       └── index.html               ← веб-панель собственника (логин, лиды, цены)
│
├── api/
│   ├── _supabase.js                 ← общий Supabase-клиент (не является API route)
│   ├── _jwt.js                      ← JWT sign/verify для admin-панели
│   ├── lead.js                      ← POST /api/lead — принять заявку, PDF, уведомление
│   ├── prices.js                    ← GET /api/prices — текущие цены из Supabase
│   ├── faq.js                       ← GET /api/faq?step=X — FAQ по шагам
│   ├── portfolio.js                 ← GET /api/portfolio — видимые фото портфолио
│   ├── webhook.js                   ← POST /api/webhook — Telegram bot события
│   ├── pdf-template.js              ← генератор PDF через PDFKit
│   └── admin/
│       ├── login.js                 ← POST /api/admin/login — выдача JWT
│       ├── leads.js                 ← GET /api/admin/leads — список лидов
│       ├── leads/[id].js            ← GET/PATCH /api/admin/leads/:id
│       └── prices.js                ← GET/PUT /api/admin/prices
│
├── supabase/
│   └── migrations/
│       └── 001_init.sql             ← все CREATE TABLE + RLS + начальные данные
│
├── package.json                     ← зависимости: @supabase/supabase-js, pdfkit, jsonwebtoken
├── vercel.json                      ← outputDirectory="tg-app", SPA rewrite (api/ исключён)
├── .env                             ← секреты (в .gitignore, никогда не коммитить!)
├── .env.example                     ← шаблон переменных окружения
│
├── CLAUDE.md                        ← этот файл — навигация по проекту
├── BACKEND-PLAN.md                  ← архитектурный план бэкенда
├── TESTING.md                       ← руководство для тестировщика
├── ERRORS.md                        ← журнал ошибок и исправлений
└── brief.md / research.md / specs/  ← исходные материалы
```

---

## Навигация между экранами

Все 12 экранов — `<div class="screen" id="...">` в `index.html`.
Переходы управляются через `SCREEN_ORDER` + `navigateTo(stepIndex)` в `app.js`.

| Индекс | ID | Экран | Что делает |
|--------|-----|-------|-----------|
| 0 | screen-0 | Старт | Лендинг с триггерами доверия, кнопка «Начать расчёт» |
| 1 | screen-region | Регион | 4 карточки региона, Московская обл. / Новая Москва +15% |
| 2 | screen-1 | Площадь + Этажность | Слайдер 60–300 м² + chips + 3 карточки этажности |
| 3 | screen-2 | Фундамент | 4 карточки в сетке 2×2 |
| 4 | screen-3 | Кровля | 3 материала + 3 формы + превью цены |
| 5 | screen-4 | Стиль | 3 вертикальные карточки (+10%, +18%) |
| 6 | screen-facade | Фасад | 4 карточки с ценами за м² |
| 7 | screen-5 | Отделка | 5 горизонтальных карточек (включая Вайт бокс) |
| 8 | screen-6 | Опции | 3 чекбокса + бегущий итог |
| 9 | screen-7 | Результат | Разбивка, итог, ипотека, кнопки |
| 10 | screen-8 | Контакт | Имя + телефон + согласие |
| 11 | screen-9 | Спасибо | Анимация + кнопка «Скачать смету PDF» + ссылка на канал |

Ключевые функции навигации в [tg-app/js/app.js](tg-app/js/app.js):
- `navigateTo(stepIndex)` — переход к экрану по индексу в `SCREEN_ORDER`
- `navigateForward()` / `navigateBack()` — вперёд/назад на 1 шаг
- `handleMainButton()` — switch по `screenId()`, валидирует выборы перед переходом

---

## Состояние приложения

`appState` в [tg-app/js/app.js](tg-app/js/app.js):

```js
{
  region:       null,  // 'kaluga' | 'obninsk' | 'moscow_obl' | 'new_moscow'
  area:         120,   // число, 60–300 м²
  floors:       null,  // 'single' | 'mansard' | 'double'
  foundation:   null,  // 'pile' | 'strip' | 'slab' | 'ushp'
  roofMaterial: null,  // 'metalTile' | 'softRoofing' | 'standingSeam'
  roofShape:    null,  // 'gable' | 'hip' | 'flat'
  style:        null,  // 'classic' | 'hitech' | 'chalet'
  facade:       null,  // 'plaster' | 'brick' | 'panel' | 'none'
  finishing:    null,  // 'shell' | 'rough' | 'whitebox' | 'turnkeyEco' | 'turnkeyStd'
  options:      [],    // ['terrace', 'garage', 'bathhouse']
  currentStep:  0,
}
```

---

## Где менять данные

### Цены (живые)
**Предпочтительный способ:** веб-панель `/admin/` → раздел «Цены» → сохранить.
Цены хранятся в Supabase (таблица `prices`, строка `id='current'`).
Фронтенд загружает их при старте через `GET /api/prices`.

**Fallback (без Supabase):** файл [tg-app/js/prices.js](tg-app/js/prices.js)
Структура: объект `PRICES` с ключами `boxPerSqm`, `foundation`, `roofMaterial`, `roofShape`, `style`, `facade`, `finishing`, `options`, `region`.
После изменения — `git commit + push`, Vercel задеплоит.

### Тексты на экранах
Файл: [tg-app/index.html](tg-app/index.html)

- Название компании: `screen-0`, класс `.start-company`
- Регион/город: класс `.start-region`
- Триггеры доверия: список `.trust-list`
- Текст на «Спасибо» (имя менеджера, время): `screen-9`

### Ссылка на Telegram-канал
Файл: [tg-app/js/app.js](tg-app/js/app.js) — строка `tgApp.openTelegramLink('https://t.me/yourchannel')`.

---

## Формула расчёта

```
box         = area × PRICES.boxPerSqm[floors]
foundation  = area × PRICES.foundation[foundation]
roof        = box × roofMaterial_коэф × roofShape_коэф − box
structural  = box + foundation + roof

styleSurch  = structural × (PRICES.style[style] − 1)
facadeCost  = area × PRICES.facade[facade]
finishing   = area × PRICES.finishing[finishing]
options     = сумма PRICES.options[o] для выбранных o

regionBase  = structural + styleSurch + facadeCost + finishing
regionSurch = regionBase × (PRICES.region[region] − 1)

total       = regionBase + regionSurch + options   ← опции вне регионального коэф.
perSqm      = total / area
mortgage    = total × 0.005 / (1 − 1.005^−240)    ← 6% на 20 лет
```

Реализация: [tg-app/js/calculator.js](tg-app/js/calculator.js), функция `calculate(state)`.

---

## Путь данных при отправке заявки

```
screen-8 (форма) → POST /api/lead
  → валидация name + phone
  → Supabase: INSERT INTO leads (если настроен)
  → PDFKit: генерация PDF-сметы
  → Supabase Storage: upload {leadId}.pdf
  → Telegram Bot API: sendMessage собственнику
  → ответ: { ok: true, pdfUrl: "https://..." }
screen-9 → показывает кнопку «Скачать смету PDF» с pdfUrl
```

Функция: [api/lead.js](api/lead.js)
PDF-генератор: [api/pdf-template.js](api/pdf-template.js)

> PDF отправляется как ссылка на экране «Спасибо», **не** через Telegram Bot (бот не может писать незнакомым пользователям).

---

## Telegram SDK

SDK подключён в `index.html`:
```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

В `app.js` доступен как `tgApp` (`window.Telegram.WebApp`, если `initData` не пустой).
В браузере `tgApp === null` — показывается кнопка-заглушка `#browser-main-btn`.

Используемые методы:
- `tgApp.expand()` / `tgApp.ready()` — инициализация
- `tgApp.MainButton` — CTA-кнопка снизу (текст меняется с каждым экраном)
- `tgApp.BackButton` — кнопка «Назад» (видима на шагах 1–10)
- `tgApp.enableClosingConfirmation()` — включается после шага screen-2
- `tgApp.HapticFeedback.selectionChanged()` / `.notificationOccurred('error')` — тактильная обратная связь
- `tgApp.themeParams` — цвета темы → CSS-переменные
- `tgApp.initDataUnsafe.user.first_name` — имя пользователя для приветствия

---

## Тема и стили

CSS-переменные → [tg-app/css/app.css](tg-app/css/app.css), раздел `:root`.

| Переменная | Значение | Где используется |
|------------|----------|-----------------|
| `--tg-bg` | фон страницы | body, карточки |
| `--tg-text` | основной текст | заголовки |
| `--tg-secondary` | фон карточек | .select-card |
| `--tg-hint` | подсказки | .card-price, мелкий текст |
| `--accent` | `#2AABEE` | рамки выбора, кнопки |
| `--card-radius` | `14px` | все карточки |

Тёмная тема: класс `dark-theme` на `<body>` при `tgApp.colorScheme === 'dark'`.

---

## Веб-панель собственника

URL: `/admin/` (файл [tg-app/admin/index.html](tg-app/admin/index.html))

Разделы:
- **Заявки** — таблица лидов, поиск, смена статуса (new/called/accepted/refused), заметки
- **Цены** — все поля таблицы `prices`, сохранение через `PUT /api/admin/prices`

Аутентификация: пароль → JWT-токен → хранится в `localStorage`, истекает через 8 часов.

---

## Переменные окружения

Задать в Vercel Dashboard → Project → Settings → Environment Variables:

| Переменная | Обязательна | Что содержит |
|------------|-------------|--------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Токен из BotFather |
| `TELEGRAM_CHAT_ID` | ✅ | chat_id собственника (узнать через @userinfobot) |
| `TELEGRAM_OWNER_ID` | Для /addphoto | Telegram user_id собственника |
| `TELEGRAM_WEBHOOK_SECRET` | При webhook | Секрет для валидации запросов |
| `SUPABASE_URL` | Для БД/PDF | URL Supabase проекта |
| `SUPABASE_SERVICE_KEY` | Для БД/PDF | service_role ключ (только бэкенд!) |
| `ADMIN_PASSWORD` | Для панели | Пароль входа в /admin/ |
| `JWT_SECRET` | Для панели | Секрет подписи JWT (≥32 символа) |

> `SUPABASE_SERVICE_KEY` и `TELEGRAM_BOT_TOKEN` — секреты. Никогда не попадают во фронтенд, не коммитятся в git.

---

## Telegram Webhook — регистрация

Выполнить один раз после деплоя:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://ВАШ-САЙТ.vercel.app/api/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"

# Проверить статус:
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

---

## Чеклист перед запуском

**Обязательно:**
- [ ] Задать `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` в Vercel Dashboard
- [ ] Заменить `https://t.me/yourchannel` в `app.js` на реальный канал
- [ ] В BotFather: `/setmenubutton` → вставить Vercel URL

**Для полного функционала (БД, PDF, панель):**
- [ ] Создать Supabase проект, запустить `supabase/migrations/001_init.sql`
- [ ] Создать bucket `pdfs` в Supabase Storage (Public)
- [ ] Задать `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_PASSWORD`, `JWT_SECRET`
- [ ] Задать `TELEGRAM_OWNER_ID`, `TELEGRAM_WEBHOOK_SECRET`
- [ ] Зарегистрировать webhook (команда выше)
- [ ] Проверить реальные цены в `prices.js` или через панель `/admin/`

**Тестирование:**
- [ ] Пройти полный флоу калькулятора на реальном телефоне в Telegram
- [ ] Отправить тестовую заявку и убедиться, что уведомление пришло
- [ ] Открыть `/admin/` и войти с паролем
