// app.js — Главный файл: навигация, Telegram SDK, обработка UI.
// Требует: prices.js и calculator.js (загружаются до этого файла).

// =====================================
// Telegram WebApp
// =====================================
const _tgWA = window.Telegram && window.Telegram.WebApp;
const tgApp = (_tgWA && _tgWA.initData !== '') ? _tgWA : null;

// =====================================
// ПОРЯДОК ЭКРАНОВ
// =====================================
const SCREEN_ORDER = [
  'screen-0',       // Старт
  'screen-region',  // Регион
  'screen-1',       // Площадь + Этажность
  'screen-2',       // Фундамент
  'screen-3',       // Кровля
  'screen-4',       // Стиль
  'screen-facade',  // Фасад
  'screen-5',       // Отделка (включая Вайт бокс)
  'screen-6',       // Дополнительные опции
  'screen-7',       // Результат
  'screen-8',       // Форма контакта
  'screen-9',       // Спасибо
];

function screenId() { return SCREEN_ORDER[appState.currentStep]; }
function totalSteps() { return SCREEN_ORDER.length; }

// =====================================
// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// =====================================
let appState = {
  region:       null,   // 'kaluga' | 'obninsk' | 'moscow_obl' | 'new_moscow'
  area:         120,
  floors:       null,   // 'single' | 'mansard' | 'double'
  foundation:   null,   // 'pile' | 'strip' | 'slab' | 'ushp'
  roofMaterial: null,   // 'metalTile' | 'softRoofing' | 'standingSeam'
  roofShape:    null,   // 'gable' | 'hip' | 'flat'
  style:        null,   // 'classic' | 'hitech' | 'chalet'
  facade:       null,   // 'plaster' | 'brick' | 'panel' | 'none'
  finishing:    null,   // 'shell' | 'rough' | 'whitebox' | 'turnkeyEco' | 'turnkeyStd'
  options:      [],
  currentStep:  0,
};

// Текст MainButton для каждого экрана
const BTN_TEXTS = {
  'screen-0':      '✦ Начать расчёт',
  'screen-region': 'Далее →',
  'screen-1':      'Далее →',
  'screen-2':      'Далее →',
  'screen-3':      'Далее →',
  'screen-4':      'Далее →',
  'screen-facade': 'Далее →',
  'screen-5':      'Далее →',
  'screen-6':      '⚡ Рассчитать',
  'screen-7':      'Узнать точную стоимость',
  'screen-8':      'Отправить заявку',
  'screen-9':      'Смотреть проекты',
};

// =====================================
// ИНИЦИАЛИЗАЦИЯ
// =====================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadPricesFromApi();
  initTelegramApp();
  applyTelegramTheme();
  applyGreeting();
  setupAllListeners();
  updateSliderFill(120);
  initOffer();
});

async function loadPricesFromApi() {
  try {
    const resp = await fetch('/api/prices');
    if (!resp.ok) return;
    const json = await resp.json();
    if (json.ok && json.prices) {
      Object.assign(PRICES, json.prices);
    }
  } catch (e) {
    // Используем fallback из prices.js
  }
}

function initTelegramApp() {
  if (tgApp) {
    tgApp.ready();
    tgApp.expand();
    tgApp.BackButton.onClick(() => navigateBack());
    tgApp.MainButton.onClick(() => handleMainButton());
    tgApp.MainButton.setText(BTN_TEXTS['screen-0']);
    tgApp.MainButton.show();
  } else {
    const btn = document.getElementById('browser-main-btn');
    btn.style.display = 'flex';
    btn.addEventListener('click', handleMainButton);
    document.getElementById('app').style.paddingBottom = '54px';
  }
}

function applyGreeting() {
  const el = document.getElementById('start-greeting');
  if (!el) return;
  const name = tgApp && tgApp.initDataUnsafe && tgApp.initDataUnsafe.user
    ? tgApp.initDataUnsafe.user.first_name
    : null;
  if (name) el.textContent = 'Привет, ' + name + ' 👋';
}

function applyTelegramTheme() {
  if (!tgApp || !tgApp.themeParams) return;
  const theme = tgApp.themeParams;
  const root  = document.documentElement;
  const map = {
    bg_color:           '--tg-bg',
    text_color:         '--tg-text',
    hint_color:         '--tg-hint',
    link_color:         '--tg-link',
    button_color:       '--tg-btn',
    button_text_color:  '--tg-btn-text',
    secondary_bg_color: '--tg-secondary',
  };
  Object.entries(map).forEach(([key, cssVar]) => {
    if (theme[key]) root.style.setProperty(cssVar, theme[key]);
  });
  if (tgApp.colorScheme === 'dark') document.body.classList.add('dark-theme');
}

// =====================================
// НАВИГАЦИЯ
// =====================================
let isAnimating = false;

function navigateTo(stepIndex, direction) {
  if (isAnimating) return;

  const current = document.querySelector('.screen.active');
  const next    = document.getElementById(SCREEN_ORDER[stepIndex]);
  if (!next) return;

  isAnimating = true;
  appState.currentStep = stepIndex;

  const exitTranslate = direction === 'forward' ? 'translateX(-28px)' : 'translateX(28px)';
  const enterStart    = direction === 'forward' ? 'translateX(40px)'  : 'translateX(-40px)';

  if (current && current !== next) {
    current.style.transition = 'transform 0.26s ease, opacity 0.20s ease';
    current.style.transform  = exitTranslate;
    current.style.opacity    = '0';
    current.style.pointerEvents = 'none';
    setTimeout(() => { current.classList.remove('active'); current.style.cssText = ''; }, 260);
  }

  next.style.transition = 'none';
  next.style.transform  = enterStart;
  next.style.opacity    = '0';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      next.style.transition = 'transform 0.28s ease, opacity 0.24s ease';
      next.style.transform  = 'translateX(0)';
      next.style.opacity    = '1';
      next.classList.add('active');
      setTimeout(() => { next.style.cssText = ''; isAnimating = false; }, 300);
    });
  });

  updateMainButtonState();
  updateBackButton();
  onScreenEnter(stepIndex);
}

function navigateForward() {
  const step = appState.currentStep;
  const sid  = screenId();

  if (sid === 'screen-2' && tgApp) tgApp.enableClosingConfirmation();
  if (sid === 'screen-6') renderResult();

  navigateTo(step + 1, 'forward');
}

function navigateBack() {
  if (appState.currentStep > 0) {
    navigateTo(appState.currentStep - 1, 'back');
  }
}

// =====================================
// ГЛАВНАЯ КНОПКА
// =====================================
function handleMainButton() {
  const sid = screenId();

  switch (sid) {
    case 'screen-0': navigateForward(); break;

    case 'screen-region':
      if (!appState.region) { flashButton(); return; }
      navigateForward(); break;

    case 'screen-1':
      if (!appState.floors) { flashButton(); return; }
      navigateForward(); break;

    case 'screen-2':
      if (!appState.foundation) { flashButton(); return; }
      navigateForward(); break;

    case 'screen-3':
      if (!appState.roofMaterial || !appState.roofShape) { flashButton(); return; }
      navigateForward(); break;

    case 'screen-4':
      if (!appState.style) { flashButton(); return; }
      navigateForward(); break;

    case 'screen-facade':
      if (!appState.facade) { flashButton(); return; }
      navigateForward(); break;

    case 'screen-5':
      if (!appState.finishing) { flashButton(); return; }
      navigateForward(); break;

    case 'screen-6': navigateForward(); break;
    case 'screen-7': navigateForward(); break;

    case 'screen-8': submitLead(); break;

    case 'screen-9':
      if (tgApp) tgApp.openTelegramLink('https://t.me/yourchannel');
      break;
  }
}

function updateMainButtonState() {
  const sid = screenId();
  const text = BTN_TEXTS[sid] || 'Далее';

  const activeMap = {
    'screen-0':      true,
    'screen-region': !!appState.region,
    'screen-1':      !!appState.floors,
    'screen-2':      !!appState.foundation,
    'screen-3':      !!(appState.roofMaterial && appState.roofShape),
    'screen-4':      !!appState.style,
    'screen-facade': !!appState.facade,
    'screen-5':      !!appState.finishing,
    'screen-6':      true,
    'screen-7':      true,
    'screen-8':      canSubmitForm(),
    'screen-9':      true,
  };
  const isActive = activeMap[sid] !== undefined ? activeMap[sid] : true;

  if (tgApp) {
    tgApp.MainButton.setText(text);
    isActive ? tgApp.MainButton.enable() : tgApp.MainButton.disable();
    tgApp.MainButton.show();
  } else {
    const btn  = document.getElementById('browser-main-btn');
    const span = document.getElementById('browser-btn-text');
    if (btn && span) {
      span.textContent = text;
      btn.classList.toggle('disabled', !isActive);
    }
  }
}

function updateBackButton() {
  if (!tgApp) return;
  const step = appState.currentStep;
  (step > 0 && step < totalSteps() - 1) ? tgApp.BackButton.show() : tgApp.BackButton.hide();
}

function flashButton() {
  if (tgApp && tgApp.HapticFeedback) tgApp.HapticFeedback.notificationOccurred('error');
  const btn = document.getElementById('browser-main-btn');
  if (!btn) return;
  btn.style.opacity = '0.5';
  setTimeout(() => { btn.style.opacity = ''; }, 120);
}

// =====================================
// СОБЫТИЯ ПРИ ВХОДЕ НА ЭКРАН
// =====================================
function onScreenEnter(stepIndex) {
  const sid = SCREEN_ORDER[stepIndex];
  switch (sid) {
    case 'screen-3':  updatePricePreview(); break;
    case 'screen-6':  updateOptionsTotal(); break;
    case 'screen-8':  setupContactForm(); break;
  }
}

// =====================================
// ЭКРАН РЕГИОНА
// =====================================
function setupRegionCards() {
  setupCardGroup('step-region-cards', 'region', () => {
    updateMainButtonState();
  });
}

// =====================================
// ШАГ 1: ПЛОЩАДЬ + ЭТАЖНОСТЬ
// =====================================
function setupSlider() {
  const slider = document.getElementById('area-slider');
  if (!slider) return;

  slider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    appState.area = value;
    updateAreaDisplay(value);
    updateSliderFill(value);
    clearActiveChips();
    updateMainButtonState();
    updatePricePreview();
  });
}

function updateAreaDisplay(value) {
  const el = document.getElementById('area-display');
  if (el) el.innerHTML = value + ' <span>м²</span>';
}

function updateSliderFill(value) {
  const slider = document.getElementById('area-slider');
  if (!slider) return;
  const pct = ((value - 60) / (300 - 60)) * 100;
  slider.style.setProperty('--fill', pct.toFixed(1) + '%');
}

function clearActiveChips() {
  document.querySelectorAll('.area-chip').forEach(c => c.classList.remove('active'));
}

// =====================================
// КАРТОЧКИ ВЫБОРА (универсальные)
// =====================================
function setupCardGroup(containerId, stateKey, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.addEventListener('click', (e) => {
    const card = e.target.closest('[data-value]');
    if (!card || !card.classList.contains('select-card')) return;

    const value = card.dataset.value;
    appState[stateKey] = value;

    container.querySelectorAll('.select-card').forEach(c => c.classList.remove('selected', 'just-selected'));
    card.classList.add('selected', 'just-selected');
    setTimeout(() => card.classList.remove('just-selected'), 250);

    if (tgApp && tgApp.HapticFeedback) tgApp.HapticFeedback.selectionChanged();

    updateMainButtonState();
    if (onSelect) onSelect(value);
  });
}

function setupStyleCards() {
  const container = document.getElementById('step4-cards');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const card = e.target.closest('[data-value]');
    if (!card || !card.classList.contains('style-card')) return;

    const value = card.dataset.value;
    appState.style = value;

    container.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected', 'just-selected'));
    card.classList.add('selected', 'just-selected');
    setTimeout(() => card.classList.remove('just-selected'), 250);

    if (tgApp && tgApp.HapticFeedback) tgApp.HapticFeedback.selectionChanged();

    updateMainButtonState();
    updatePricePreview();
    updateOptionsTotal();
  });
}

// =====================================
// ШАГ 3: ПРЕВЬЮ ЦЕНЫ
// =====================================
function updatePricePreview() {
  // Превью доступно начиная с экрана кровли (index 4)
  if (appState.currentStep < 4) return;
  const preview  = document.getElementById('price-preview');
  const amountEl = document.getElementById('preview-amount');
  if (!preview || !amountEl) return;

  const partial = getPartialEstimate(appState);
  if (partial > 0) {
    amountEl.textContent = 'от ' + formatPriceMln(partial);
    preview.classList.add('visible');
  }
}

// =====================================
// ШАГ 6: ОПЦИИ
// =====================================
function setupOptionCards() {
  document.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      const value = card.dataset.value;
      const idx   = appState.options.indexOf(value);

      if (idx === -1) {
        appState.options.push(value);
        card.classList.add('checked', 'just-selected');
        card.querySelector('.option-checkbox').classList.add('checked');
      } else {
        appState.options.splice(idx, 1);
        card.classList.remove('checked', 'just-selected');
        card.querySelector('.option-checkbox').classList.remove('checked');
      }

      setTimeout(() => card.classList.remove('just-selected'), 250);
      if (tgApp && tgApp.HapticFeedback) tgApp.HapticFeedback.selectionChanged();
      updateOptionsTotal();
    });
  });
}

function updateOptionsTotal() {
  const el = document.getElementById('options-total');
  if (!el) return;
  const result = calculate(appState);
  el.textContent = result ? formatPrice(result.total) : '—';
}

// =====================================
// ЭКРАН РЕЗУЛЬТАТА
// =====================================
function renderResult() {
  const result = calculate(appState);
  if (!result) return;

  const floorLabels  = { single: '1 этаж', mansard: '1,5 этажа', double: '2 этажа' };
  const styleLabels  = { classic: 'Классика', hitech: 'Хай-тек', chalet: 'Шале' };
  const finLabels    = { shell: 'Коробка', rough: 'Черновая отделка', whitebox: 'Вайт бокс', turnkeyEco: 'Под ключ Эконом', turnkeyStd: 'Под ключ Стандарт' };
  const foundLabels  = { pile: 'свайный', strip: 'ленточный', slab: 'монолит', ushp: 'УШП' };
  const roofLabels   = { metalTile: 'металлочерепица', softRoofing: 'мягкая черепица', standingSeam: 'фальцевая' };
  const facadeLabels = { plaster: 'штукатурка', brick: 'кирпич', panel: 'панель', none: 'без фасада' };
  const regionLabels = { kaluga: 'Калужская обл.', obninsk: 'Обнинск', moscow_obl: 'МО', new_moscow: 'Новая Москва' };
  const optLabels    = { terrace: 'Терраса', garage: 'Гараж', bathhouse: 'Баня' };

  document.getElementById('result-title').textContent =
    `🏠 ${appState.area} м² · ${floorLabels[appState.floors]}`;
  document.getElementById('result-subtitle').textContent =
    `Газобетон · ${styleLabels[appState.style] || ''} · ${regionLabels[appState.region] || ''}`;

  const rows = [
    { label: `Фундамент (${foundLabels[appState.foundation]})`, amount: result.breakdown.foundation },
    { label: 'Коробка из газобетона',                           amount: result.breakdown.box },
    { label: `Кровля (${roofLabels[appState.roofMaterial]})`,  amount: result.breakdown.roof },
  ];

  if (result.breakdown.style > 0) {
    const pct = appState.style === 'hitech' ? 10 : 18;
    rows.push({ label: `Надбавка за стиль (+${pct}%)`, amount: result.breakdown.style });
  }
  if (result.breakdown.facade > 0) {
    rows.push({ label: `Фасад (${facadeLabels[appState.facade]})`, amount: result.breakdown.facade });
  }
  if (result.breakdown.finishing > 0) {
    rows.push({ label: finLabels[appState.finishing], amount: result.breakdown.finishing });
  }
  if (result.breakdown.options > 0) {
    const names = appState.options.map(o => optLabels[o]).join(', ');
    rows.push({ label: names, amount: result.breakdown.options });
  }
  if (result.breakdown.region > 0) {
    const coeff = PRICES.region[appState.region];
    rows.push({ label: `Региональная надбавка (+${Math.round((coeff - 1) * 100)}%)`, amount: result.breakdown.region });
  }

  document.getElementById('result-breakdown').innerHTML = rows
    .map(r => `
      <div class="result-row">
        <span class="result-row__label">${r.label}</span>
        <span class="result-row__amount">${formatPrice(r.amount)}</span>
      </div>`)
    .join('');

  document.getElementById('result-total').textContent    = '≈ ' + formatPrice(result.total);
  document.getElementById('result-per-sqm').textContent  = formatPrice(result.perSqm) + '/м²';
  document.getElementById('result-mortgage').textContent = 'от ' + formatPrice(result.mortgage) + '/мес';
}

// =====================================
// ФОРМА КОНТАКТА
// =====================================
function setupContactForm() {
  const nameInput    = document.getElementById('contact-name');
  const phoneInput   = document.getElementById('contact-phone');
  const consentInput = document.getElementById('contact-consent');
  const consentBox   = document.getElementById('consent-box');
  const consentLabel = document.getElementById('consent-label');

  if (!nameInput) return;

  if (tgApp && tgApp.initDataUnsafe && tgApp.initDataUnsafe.user) {
    const u = tgApp.initDataUnsafe.user;
    if (u.first_name) nameInput.value = u.first_name;
  }

  const result = calculate(appState);
  if (result) {
    document.getElementById('form-total').textContent = '≈ ' + formatPrice(result.total);
  }

  phoneInput.addEventListener('input', (e) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (raw.startsWith('8')) raw = '7' + raw.slice(1);
    if (raw.startsWith('9')) raw = '7' + raw;
    if (!raw.startsWith('7')) raw = raw.length > 0 ? '7' + raw : '';
    raw = raw.slice(0, 11);

    let fmt = '+7';
    if (raw.length > 1) fmt += ' (' + raw.slice(1, 4);
    if (raw.length >= 4) fmt += ') ' + raw.slice(4, 7);
    if (raw.length >= 7) fmt += '-' + raw.slice(7, 9);
    if (raw.length >= 9) fmt += '-' + raw.slice(9, 11);

    e.target.value = fmt;
    updateMainButtonState();
  });

  nameInput.addEventListener('input',  () => updateMainButtonState());
  phoneInput.addEventListener('input', () => updateMainButtonState());

  consentLabel.addEventListener('click', (e) => {
    e.preventDefault();
    const checked = !consentInput.checked;
    consentInput.checked = checked;
    consentBox.classList.toggle('checked', checked);
    updateMainButtonState();
  });
}

function canSubmitForm() {
  const name    = document.getElementById('contact-name');
  const phone   = document.getElementById('contact-phone');
  const consent = document.getElementById('contact-consent');
  if (!name || !phone || !consent) return false;
  const digits = phone.value.replace(/\D/g, '');
  return name.value.trim().length >= 2 && digits.length === 11 && consent.checked;
}

async function submitLead() {
  if (!canSubmitForm()) { flashButton(); return; }

  const name   = document.getElementById('contact-name').value.trim();
  const phone  = document.getElementById('contact-phone').value;
  const result = calculate(appState);

  if (tgApp) {
    tgApp.MainButton.showProgress(false);
    tgApp.MainButton.disable();
  } else {
    const btn = document.getElementById('browser-main-btn');
    if (btn) { btn.style.opacity = '0.6'; btn.style.pointerEvents = 'none'; }
  }

  try {
    const resp = await fetch('/api/lead', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name,
        phone,
        region:       appState.region,
        area:         appState.area,
        floors:       appState.floors,
        foundation:   appState.foundation,
        roofMaterial: appState.roofMaterial,
        roofShape:    appState.roofShape,
        style:        appState.style,
        facade:       appState.facade,
        finishing:    appState.finishing,
        options:      appState.options,
        total:        result ? result.total    : 0,
        perSqm:       result ? result.perSqm   : 0,
        mortgage:     result ? result.mortgage : 0,
        breakdown:    result ? result.breakdown : {},
        tgUser:       tgApp ? (tgApp.initDataUnsafe && tgApp.initDataUnsafe.user) : null,
      }),
    });

    if (tgApp) { tgApp.MainButton.hideProgress(); }
    else {
      const btn = document.getElementById('browser-main-btn');
      if (btn) { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
    }

    if (resp.ok) {
      const json = await resp.json();
      if (tgApp && tgApp.HapticFeedback) tgApp.HapticFeedback.notificationOccurred('success');

      // Показываем кнопку скачивания PDF если есть ссылка
      if (json.pdfUrl) {
        const pdfBtn = document.getElementById('pdf-download-btn');
        if (pdfBtn) {
          pdfBtn.href = json.pdfUrl;
          pdfBtn.style.display = 'flex';
        }
      }

      navigateTo(SCREEN_ORDER.indexOf('screen-9'), 'forward');
    } else {
      showFormError('Ошибка отправки. Попробуйте ещё раз.');
      if (tgApp) tgApp.MainButton.enable();
    }

  } catch (err) {
    if (tgApp) { tgApp.MainButton.hideProgress(); tgApp.MainButton.enable(); }
    else {
      const btn = document.getElementById('browser-main-btn');
      if (btn) { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
    }
    showFormError('Нет соединения. Проверьте интернет.');
  }
}

function showFormError(msg) {
  const el = document.getElementById('form-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// =====================================
// КНОПКА «ПОДЕЛИТЬСЯ»
// =====================================
function shareResult() {
  const result = calculate(appState);
  const botUrl = 'https://t.me/Kalkulator_stroy_bot/app';
  const text   = result
    ? `🏠 Посчитал дом из газобетона ${appState.area} м² — вышло ≈ ${formatPrice(result.total)}. Рассчитай свой за 2 минуты:`
    : '🏠 Рассчитай стоимость своего дома из газобетона за 2 минуты:';

  if (tgApp) {
    tgApp.openTelegramLink(
      'https://t.me/share/url?url=' + encodeURIComponent(botUrl) +
      '&text=' + encodeURIComponent(text)
    );
  } else if (navigator.share) {
    navigator.share({ url: botUrl, text });
  }
}

// =====================================
// ИНИЦИАЛИЗАЦИЯ ВСЕХ СЛУШАТЕЛЕЙ
// =====================================
function setupAllListeners() {
  setupSlider();

  document.querySelectorAll('.area-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const value = parseInt(chip.dataset.value);
      appState.area = value;
      const slider = document.getElementById('area-slider');
      if (slider) slider.value = value;
      updateAreaDisplay(value);
      updateSliderFill(value);
      clearActiveChips();
      chip.classList.add('active');
      updateMainButtonState();
      updatePricePreview();
    });
  });

  // Регион
  setupRegionCards();

  // Шаг 1: этажность
  setupCardGroup('step1-floors', 'floors', () => {
    updateMainButtonState();
    updatePricePreview();
  });

  // Шаг 2: фундамент
  setupCardGroup('step2-cards', 'foundation', () => updateMainButtonState());

  // Шаг 3: кровля
  setupCardGroup('step3-material', 'roofMaterial', () => {
    updateMainButtonState();
    updatePricePreview();
  });
  setupCardGroup('step3-shape', 'roofShape', () => {
    updateMainButtonState();
    updatePricePreview();
  });

  // Шаг 4: стиль
  setupStyleCards();

  // Фасад
  setupCardGroup('step-facade-cards', 'facade', () => updateMainButtonState());

  // Шаг 5: отделка
  setupCardGroup('step5-cards', 'finishing', () => {
    updateMainButtonState();
    updateOptionsTotal();
  });

  // Шаг 6: опции
  setupOptionCards();

  // Результат: Поделиться
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) shareBtn.addEventListener('click', shareResult);

  // Результат: Пересчитать
  const recalcBtn = document.getElementById('recalc-btn');
  if (recalcBtn) {
    recalcBtn.addEventListener('click', () => {
      appState = {
        region: null, area: 120, floors: null, foundation: null,
        roofMaterial: null, roofShape: null, style: null,
        facade: null, finishing: null, options: [], currentStep: 0,
      };

      document.querySelectorAll('.select-card.selected').forEach(c => c.classList.remove('selected'));
      document.querySelectorAll('.style-card.selected').forEach(c => c.classList.remove('selected'));
      document.querySelectorAll('.option-card.checked').forEach(c => {
        c.classList.remove('checked');
        c.querySelector('.option-checkbox').classList.remove('checked');
      });
      clearActiveChips();

      const slider = document.getElementById('area-slider');
      if (slider) slider.value = 120;
      updateAreaDisplay(120);
      updateSliderFill(120);

      const preview = document.getElementById('price-preview');
      if (preview) preview.classList.remove('visible');

      document.querySelector('.area-chip[data-value="120"]')?.classList.add('active');

      navigateTo(SCREEN_ORDER.indexOf('screen-region'), 'forward');
    });
  }
}

// =====================================
// ОФФЕР — показывается один раз
// =====================================
function initOffer() {
  const overlay = document.getElementById('offer-overlay');
  if (!overlay) return;

  if (localStorage.getItem('offer_shown')) {
    overlay.classList.add('hidden');
    return;
  }

  setTimeout(() => overlay.classList.remove('hidden'), 600);

  function closeOffer() {
    localStorage.setItem('offer_shown', '1');
    overlay.style.transition = 'opacity 0.22s ease';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.classList.add('hidden'), 220);
  }

  document.getElementById('offer-skip').addEventListener('click', closeOffer);
  document.getElementById('offer-cta').addEventListener('click', closeOffer);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOffer(); });
}
