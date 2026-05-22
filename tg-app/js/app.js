// app.js — Главный файл: навигация, Telegram SDK, обработка UI.
// Требует: prices.js и calculator.js (загружаются до этого файла).

// =====================================
// Telegram WebApp
// =====================================
// initData пустая строка — значит открыто в браузере, не в Telegram
const _tgWA = window.Telegram && window.Telegram.WebApp;
const tgApp = (_tgWA && _tgWA.initData !== '') ? _tgWA : null;

// =====================================
// Состояние приложения
// =====================================
let appState = {
  area:         120,
  floors:       null,   // 'single' | 'mansard' | 'double'
  foundation:   null,   // 'pile' | 'strip' | 'slab' | 'ushp'
  roofMaterial: null,   // 'metalTile' | 'softRoofing' | 'standingSeam'
  roofShape:    null,   // 'gable' | 'hip' | 'flat'
  style:        null,   // 'classic' | 'hitech' | 'chalet'
  finishing:    null,   // 'shell' | 'rough' | 'turnkeyEco' | 'turnkeyStd'
  options:      [],     // Array
  currentStep:  0,
};

// Текст MainButton для каждого шага
const BTN_TEXTS = {
  0: '✦ Начать расчёт',
  1: 'Далее →',
  2: 'Далее →',
  3: 'Далее →',
  4: 'Далее →',
  5: 'Далее →',
  6: '⚡ Рассчитать',
  7: 'Узнать точную стоимость',
  8: 'Отправить заявку',
  9: 'Смотреть проекты',
};

// =====================================
// ИНИЦИАЛИЗАЦИЯ
// =====================================
document.addEventListener('DOMContentLoaded', () => {
  initTelegramApp();
  applyTelegramTheme();
  setupAllListeners();
  updateSliderFill(120);
  initOffer();
});

function initTelegramApp() {
  if (tgApp) {
    tgApp.ready();
    tgApp.expand();

    // Подписки на нативные кнопки
    tgApp.BackButton.onClick(() => navigateBack());
    tgApp.MainButton.onClick(() => handleMainButton());

    // Показываем MainButton
    tgApp.MainButton.setText(BTN_TEXTS[0]);
    tgApp.MainButton.show();
  } else {
    // Режим браузера — показываем кнопку-заглушку
    const btn = document.getElementById('browser-main-btn');
    btn.style.display = 'flex';
    btn.addEventListener('click', handleMainButton);
    // Отступ снизу чтобы контент не перекрывался кнопкой
    document.getElementById('app').style.paddingBottom = '54px';
  }
}

function applyTelegramTheme() {
  if (!tgApp || !tgApp.themeParams) return;

  const theme = tgApp.themeParams;
  const root = document.documentElement;

  const map = {
    bg_color:            '--tg-bg',
    text_color:          '--tg-text',
    hint_color:          '--tg-hint',
    link_color:          '--tg-link',
    button_color:        '--tg-btn',
    button_text_color:   '--tg-btn-text',
    secondary_bg_color:  '--tg-secondary',
  };

  Object.entries(map).forEach(([key, cssVar]) => {
    if (theme[key]) root.style.setProperty(cssVar, theme[key]);
  });

  if (tgApp.colorScheme === 'dark') {
    document.body.classList.add('dark-theme');
  }
}

// =====================================
// НАВИГАЦИЯ
// =====================================
let isAnimating = false;

function navigateTo(step, direction) {
  if (isAnimating) return;

  const current = document.querySelector('.screen.active');
  const next = document.getElementById('screen-' + step);
  if (!next) return;

  isAnimating = true;
  appState.currentStep = step;

  const exitTranslate = direction === 'forward' ? 'translateX(-28px)' : 'translateX(28px)';
  const enterStart   = direction === 'forward' ? 'translateX(40px)'  : 'translateX(-40px)';

  // Выход текущего
  if (current && current !== next) {
    current.style.transition = 'transform 0.26s ease, opacity 0.20s ease';
    current.style.transform  = exitTranslate;
    current.style.opacity    = '0';
    current.style.pointerEvents = 'none';
    setTimeout(() => {
      current.classList.remove('active');
      current.style.cssText = '';
    }, 260);
  }

  // Вход нового
  next.style.transition = 'none';
  next.style.transform  = enterStart;
  next.style.opacity    = '0';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      next.style.transition = 'transform 0.28s ease, opacity 0.24s ease';
      next.style.transform  = 'translateX(0)';
      next.style.opacity    = '1';
      next.classList.add('active');

      setTimeout(() => {
        next.style.cssText = '';
        isAnimating = false;
      }, 300);
    });
  });

  updateMainButtonState();
  updateBackButton();
  onScreenEnter(step);
}

function navigateForward() {
  const step = appState.currentStep;

  // Включаем подтверждение закрытия после шага 2
  if (step === 2 && tgApp) tgApp.enableClosingConfirmation();

  // Рендер результата перед переходом на экран 7
  if (step === 6) renderResult();

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
  const step = appState.currentStep;

  switch (step) {
    case 0: navigateForward(); break;

    case 1:
      if (!appState.floors) { flashButton(); return; }
      navigateForward(); break;

    case 2:
      if (!appState.foundation) { flashButton(); return; }
      navigateForward(); break;

    case 3:
      if (!appState.roofMaterial || !appState.roofShape) { flashButton(); return; }
      navigateForward(); break;

    case 4:
      if (!appState.style) { flashButton(); return; }
      navigateForward(); break;

    case 5:
      if (!appState.finishing) { flashButton(); return; }
      navigateForward(); break;

    case 6: navigateForward(); break;

    case 7: navigateForward(); break;

    case 8: submitLead(); break;

    case 9:
      if (tgApp) tgApp.openTelegramLink('https://t.me/yourchannel');
      break;
  }
}

function updateMainButtonState() {
  const step = appState.currentStep;
  const text = BTN_TEXTS[step] || 'Далее';

  // Определяем активность
  const activeMap = {
    0: true,
    1: !!appState.floors,
    2: !!appState.foundation,
    3: !!(appState.roofMaterial && appState.roofShape),
    4: !!appState.style,
    5: !!appState.finishing,
    6: true,
    7: true,
    8: canSubmitForm(),
    9: true,
  };
  const isActive = activeMap[step] !== undefined ? activeMap[step] : true;

  if (tgApp) {
    tgApp.MainButton.setText(text);
    isActive ? tgApp.MainButton.enable() : tgApp.MainButton.disable();
    tgApp.MainButton.show();
  } else {
    const btn = document.getElementById('browser-main-btn');
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
  (step > 0 && step < 9) ? tgApp.BackButton.show() : tgApp.BackButton.hide();
}

// Короткая вибрация + мигание кнопки при недопустимом тапе
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
function onScreenEnter(step) {
  switch (step) {
    case 3:
      updatePricePreview();
      break;
    case 6:
      updateOptionsTotal();
      break;
    case 7:
      // Результат уже отрендерен в navigateForward()
      break;
    case 8:
      setupContactForm();
      break;
  }
}

// =====================================
// ШАГ 1: ПЛОЩАДЬ + ЭТАЖНОСТЬ
// =====================================
function setupSlider() {
  const slider  = document.getElementById('area-slider');
  const display = document.getElementById('area-display');
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

    // Снимаем выделение
    container.querySelectorAll('.select-card').forEach(c => {
      c.classList.remove('selected', 'just-selected');
    });

    // Выделяем выбранную
    card.classList.add('selected', 'just-selected');
    setTimeout(() => card.classList.remove('just-selected'), 250);

    // Haptic feedback
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

    container.querySelectorAll('.style-card').forEach(c => {
      c.classList.remove('selected', 'just-selected');
    });
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
  if (appState.currentStep < 3) return;
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

  const floorLabels = { single: '1 этаж', mansard: '1,5 этажа', double: '2 этажа' };
  const styleLabels = { classic: 'Классика', hitech: 'Хай-тек', chalet: 'Шале' };
  const finLabels   = {
    shell: 'Коробка', rough: 'Черновая отделка',
    turnkeyEco: 'Под ключ Эконом', turnkeyStd: 'Под ключ Стандарт',
  };
  const foundLabels = {
    pile: 'свайный', strip: 'ленточный', slab: 'монолит', ushp: 'УШП',
  };
  const roofLabels  = {
    metalTile: 'металлочерепица', softRoofing: 'мягкая черепица', standingSeam: 'фальцевая',
  };
  const optLabels   = { terrace: 'Терраса', garage: 'Гараж', bathhouse: 'Баня' };

  // Шапка
  document.getElementById('result-title').textContent =
    `🏠 ${appState.area} м² · ${floorLabels[appState.floors]}`;
  document.getElementById('result-subtitle').textContent =
    `Газобетон · ${styleLabels[appState.style] || ''}`;

  // Строки разбивки
  const rows = [
    { label: `Фундамент (${foundLabels[appState.foundation]})`, amount: result.breakdown.foundation },
    { label: 'Коробка из газобетона',                           amount: result.breakdown.box },
    { label: `Кровля (${roofLabels[appState.roofMaterial]})`,  amount: result.breakdown.roof },
  ];

  if (result.breakdown.style > 0) {
    const pct = appState.style === 'hitech' ? 10 : 18;
    rows.push({ label: `Надбавка за стиль (+${pct}%)`, amount: result.breakdown.style });
  }

  if (result.breakdown.finishing > 0) {
    rows.push({ label: finLabels[appState.finishing], amount: result.breakdown.finishing });
  }

  if (result.breakdown.options > 0) {
    const names = appState.options.map(o => optLabels[o]).join(', ');
    rows.push({ label: names, amount: result.breakdown.options });
  }

  document.getElementById('result-breakdown').innerHTML = rows
    .map(r => `
      <div class="result-row">
        <span class="result-row__label">${r.label}</span>
        <span class="result-row__amount">${formatPrice(r.amount)}</span>
      </div>`)
    .join('');

  // Итог
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

  // Предзаполнение имени из Telegram
  if (tgApp && tgApp.initDataUnsafe && tgApp.initDataUnsafe.user) {
    const u = tgApp.initDataUnsafe.user;
    if (u.first_name) nameInput.value = u.first_name;
  }

  // Сумма расчёта в шапке
  const result = calculate(appState);
  if (result) {
    document.getElementById('form-total').textContent = '≈ ' + formatPrice(result.total);
  }

  // Маска телефона
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

  // Обновление кнопки при изменении полей
  nameInput.addEventListener('input',  () => updateMainButtonState());
  phoneInput.addEventListener('input', () => updateMainButtonState());

  // Чекбокс
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

  const name  = document.getElementById('contact-name').value.trim();
  const phone = document.getElementById('contact-phone').value;
  const result = calculate(appState);

  // Показываем лоадер
  if (tgApp) {
    tgApp.MainButton.showProgress(false);
    tgApp.MainButton.disable();
  } else {
    const btn = document.getElementById('browser-main-btn');
    if (btn) { btn.style.opacity = '0.6'; btn.style.pointerEvents = 'none'; }
  }

  try {
    const resp = await fetch('/.netlify/functions/lead', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name,
        phone,
        area:         appState.area,
        floors:       appState.floors,
        foundation:   appState.foundation,
        roofMaterial: appState.roofMaterial,
        roofShape:    appState.roofShape,
        style:        appState.style,
        finishing:    appState.finishing,
        options:      appState.options,
        total:        result ? result.total : 0,
        tgUser:       tgApp ? (tgApp.initDataUnsafe && tgApp.initDataUnsafe.user) : null,
      }),
    });

    // Сброс лоадера
    if (tgApp) { tgApp.MainButton.hideProgress(); }
    else {
      const btn = document.getElementById('browser-main-btn');
      if (btn) { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
    }

    if (resp.ok) {
      if (tgApp && tgApp.HapticFeedback) tgApp.HapticFeedback.notificationOccurred('success');
      navigateTo(9, 'forward');
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
  if (!result || !tgApp) return;

  const text =
    `🏠 Посчитал дом из газобетона ${appState.area} м²\n` +
    `💰 Стоимость: ≈ ${formatPrice(result.total)}\n\n` +
    `Рассчитай свой дом за 2 минуты 👇`;

  // Telegram Share API (если поддерживается)
  if (tgApp.shareToStory) {
    tgApp.shareToStory(text);
  } else if (navigator.share) {
    navigator.share({ text });
  }
}

// =====================================
// ИНИЦИАЛИЗАЦИЯ ВСЕХ СЛУШАТЕЛЕЙ
// =====================================
function setupAllListeners() {
  // Слайдер
  setupSlider();

  // Чипы быстрого выбора площади
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

  // Шаг 1: этажность
  setupCardGroup('step1-floors', 'floors', () => {
    updateMainButtonState();
    updatePricePreview();
  });

  // Шаг 2: фундамент
  setupCardGroup('step2-cards', 'foundation', () => {
    updateMainButtonState();
  });

  // Шаг 3: кровля (материал)
  setupCardGroup('step3-material', 'roofMaterial', () => {
    updateMainButtonState();
    updatePricePreview();
  });

  // Шаг 3: кровля (форма)
  setupCardGroup('step3-shape', 'roofShape', () => {
    updateMainButtonState();
    updatePricePreview();
  });

  // Шаг 4: стиль
  setupStyleCards();

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
      // Сброс состояния
      appState = {
        area: 120, floors: null, foundation: null,
        roofMaterial: null, roofShape: null, style: null,
        finishing: null, options: [], currentStep: 0,
      };

      // Сброс UI-выделений
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

      navigateTo(1, 'forward');
    });
  }
}

// =====================================
// ОФФЕР — показывается один раз
// =====================================
function initOffer() {
  const overlay = document.getElementById('offer-overlay');
  if (!overlay) return;

  // Если уже видел — не показываем
  if (localStorage.getItem('offer_shown')) {
    overlay.classList.add('hidden');
    return;
  }

  // Небольшая задержка чтобы приложение успело отрисоваться
  setTimeout(() => {
    overlay.classList.remove('hidden');
  }, 600);

  function closeOffer() {
    localStorage.setItem('offer_shown', '1');
    overlay.style.transition = 'opacity 0.22s ease';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.classList.add('hidden'), 220);
  }

  // Кнопка «Пропустить»
  document.getElementById('offer-skip').addEventListener('click', closeOffer);

  // Кнопка CTA — закрываем после перехода по ссылке
  document.getElementById('offer-cta').addEventListener('click', closeOffer);

  // Тап по фону (вне карточки) — закрываем
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOffer();
  });
}
