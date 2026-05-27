// calculator.js — Логика расчёта стоимости дома.
// Чистые функции, не зависят от DOM. Требует подключённого prices.js.

function calculate(state) {
  const { area, floors, foundation, roofMaterial, roofShape, style, facade, finishing, options, region } = state;

  if (!area || !floors || !foundation || !roofMaterial || !roofShape) return null;

  // 1. Коробка из газобетона
  const boxCost = area * PRICES.boxPerSqm[floors];

  // 2. Фундамент
  const foundationCost = area * PRICES.foundation[foundation];

  // 3. Кровля — стоимость сверх базовой коробки
  const roofCost = boxCost * PRICES.roofMaterial[roofMaterial] * PRICES.roofShape[roofShape] - boxCost;

  // 4. Сумма конструктива
  const structural = boxCost + foundationCost + roofCost;

  // 5. Надбавка за стиль
  const styleSurcharge = style ? structural * (PRICES.style[style] - 1) : 0;

  // 6. Фасад
  const facadeCost = facade && PRICES.facade[facade] ? area * PRICES.facade[facade] : 0;

  // 7. Отделка
  const finishingCost = finishing ? area * PRICES.finishing[finishing] : 0;

  // 8. Опции
  const optionsCost = (options || []).reduce((sum, opt) => sum + (PRICES.options[opt] || 0), 0);

  // 9. Региональный коэффициент — применяется к конструктиву + фасад + отделка (не к опциям)
  const regionCoeff = (region && PRICES.region[region]) ? PRICES.region[region] : 1.0;
  const regionBase  = structural + styleSurcharge + facadeCost + finishingCost;
  const regionSurcharge = regionBase * (regionCoeff - 1);

  const total = regionBase + regionSurcharge + optionsCost;
  const perSqm = area > 0 ? Math.round(total / area) : 0;

  // Ипотека: аннуитетный платёж, 6% на 20 лет
  const monthlyRate = 0.06 / 12;
  const months = 240;
  const mortgage = Math.round(total * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));

  return {
    breakdown: {
      foundation: foundationCost,
      box:        boxCost,
      roof:       roofCost,
      style:      styleSurcharge,
      facade:     facadeCost,
      finishing:  finishingCost,
      options:    optionsCost,
      region:     regionSurcharge,
    },
    total,
    perSqm,
    mortgage,
  };
}

// Промежуточный расчёт — только конструктив, для превью цены на шаге 3
function getPartialEstimate(state) {
  const { area, floors, foundation, roofMaterial, roofShape } = state;

  if (!area || !floors) return 0;

  const boxCost = area * PRICES.boxPerSqm[floors];
  const foundationCost = foundation ? area * PRICES.foundation[foundation] : 0;

  let roofCost = 0;
  if (roofMaterial && roofShape) {
    roofCost = boxCost * PRICES.roofMaterial[roofMaterial] * PRICES.roofShape[roofShape] - boxCost;
  }

  return boxCost + foundationCost + roofCost;
}

// Форматирование суммы: 3 210 000 ₽
function formatPrice(amount) {
  return Math.round(amount).toLocaleString('ru-RU') + ' ₽';
}

// Форматирование в миллионах для компактного отображения
function formatPriceMln(amount) {
  if (amount >= 1000000) {
    const mln = amount / 1000000;
    const str = mln % 1 === 0 ? mln.toFixed(0) : mln.toFixed(1);
    return str + ' млн ₽';
  }
  return formatPrice(amount);
}
