# CLAUDE.md — Навигация по проекту

Telegram Mini App — калькулятор стоимости строительства дома из газобетона.
Стек: чистый HTML + CSS + JS, хостинг Vercel, бэкенд — Vercel Serverless Functions.

---

## Структура файлов

```
tg-stroyka/
├── tg-app/                          ← публичная папка (outputDirectory для Vercel)
│   ├── index.html                   ← единственная HTML-страница, все 10 экранов
│   ├── css/
│   │   └── app.css                  ← все стили (тема Telegram, карточки, анимации)
│   └── js/
│       ├── prices.js                ← конфиг цен (менять только здесь!)
│       ├── calculator.js            ← логика расчёта, форматирование
│       └── app.js                   ← навигация, Telegram SDK, обработчики событий
│
├── api/
│   └── lead.js                      ← серверная функция: принимает лид → отправляет в Telegram
│
├── vercel.json                      ← конфиг деплоя Vercel (outputDirectory = "tg-app")
│
├── brief.md                         ← план разработки с ASCII-мокапами экранов
├── specs/                           ← спецификация продукта
└── research.md                      ← конкурентный анализ и экспертные оценки
```

---

## Навигация между экранами

Все 10 экранов — `<div class="screen" id="screen-N">` в `index.html`.
Переходы управляются через JS (`navigateTo(step, direction)` в `app.js`).

| ID | Экран | Что делает |
|----|-------|-----------|
| screen-0 | Старт | Лендинг с доверием, кнопка «Начать расчёт» |
| screen-1 | Площадь + Этажность | Слайдер + chips + 3 карточки |
| screen-2 | Фундамент | 4 карточки в сетке 2×2 |
| screen-3 | Кровля | 3 материала + 3 формы + превью цены |
| screen-4 | Стиль | 3 вертикальные карточки с градиентным фоном |
| screen-5 | Отделка | 4 горизонтальные карточки |
| screen-6 | Опции | 3 чекбокса + бегущий итог |
| screen-7 | Результат | Разбивка, итог, ипотека, кнопки |
| screen-8 | Контакт | Имя + телефон + согласие |
| screen-9 | Спасибо | Анимация + сообщение + ссылка на канал |

---

## Где менять данные

### Цены
Файл: [tg-app/js/prices.js](tg-app/js/prices.js)

Структура: объект `PRICES` с ключами `boxPerSqm`, `foundation`, `roofMaterial`, `roofShape`, `style`, `finishing`, `options`.
После изменения — `git commit + push`, Vercel автоматически задеплоит.

### Тексты на экранах
Файл: [tg-app/index.html](tg-app/index.html)

- Название компании: в `screen-0`, класс `.start-company`
- Регион: класс `.start-region`
- Триггеры доверия: список `.trust-list`
- Текст на экране «Спасибо» (имя менеджера, время): в `screen-9`
- Опции и цены на шаге 6: `.option-price` внутри `screen-6` (визуальные тексты, сами суммы берутся из `prices.js`)

### Ссылка на Telegram-канал (кнопка «Смотреть проекты»)
Файл: [tg-app/js/app.js](tg-app/js/app.js), строка с `tgApp.openTelegramLink('https://t.me/yourchannel')`

---

## Telegram SDK

SDK подключён через:
```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

В `app.js` доступен как `window.Telegram.WebApp` → переменная `tgApp`.
Если открыть не в Telegram (браузер), `tgApp` будет `null` — показывается кнопка-заглушка `#browser-main-btn`.

Используемые методы:
- `tgApp.expand()` — раскрыть на весь экран
- `tgApp.ready()` — сигнал о готовности
- `tgApp.MainButton` — главная CTA-кнопка снизу
- `tgApp.BackButton` — кнопка «Назад» в хедере
- `tgApp.enableClosingConfirmation()` — включается после шага 2
- `tgApp.themeParams` — цвета темы для CSS-переменных
- `tgApp.HapticFeedback.selectionChanged()` — тактильная обратная связь

---

## Отправка лида

**Путь данных:**
```
Форма (screen-8) → POST /api/lead → Vercel Function → Telegram Bot API → чат менеджера
```

**Переменные окружения** (задать в Vercel Dashboard → Settings → Environment Variables):
- `TELEGRAM_BOT_TOKEN` — токен из BotFather
- `TELEGRAM_CHAT_ID` — chat_id менеджера (узнать через @userinfobot)

**Функция:** [api/lead.js](api/lead.js)

---

## Тема и стили

CSS-переменные темы Telegram → [tg-app/css/app.css](tg-app/css/app.css), раздел `:root`.

Ключевые переменные:
- `--tg-bg`, `--tg-text`, `--tg-secondary` — цвета фона и текста
- `--accent` — акцентный синий `#2AABEE`
- `--card-radius` — 14px, `--card-shadow` — тени карточек

Тёмная тема: автоматически при `tgApp.colorScheme === 'dark'` → класс `dark-theme` на `<body>`.

---

## Чеклист перед запуском

- [ ] Заменить цены в `prices.js` на реальные цены компании
- [ ] Заменить `https://t.me/yourchannel` в `app.js` на реальный канал
- [ ] Задать `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` в Vercel Dashboard
- [ ] Подключить Vercel к GitHub репозиторию
- [ ] В BotFather: `/setmenubutton` → вставить Vercel URL
- [ ] Протестировать на реальном телефоне в Telegram
- [ ] Проверить работу лидов (отправить тестовую заявку)
