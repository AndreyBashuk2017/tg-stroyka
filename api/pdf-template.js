// api/pdf-template.js — Генерация PDF-сметы через PDFKit
const PDFDocument = require('pdfkit');

const LABELS = {
  region:   { kaluga: 'Калужская обл.', obninsk: 'Обнинск', moscow_obl: 'Московская обл.', new_moscow: 'Новая Москва' },
  floors:   { single: '1 этаж', mansard: '1,5 этажа (мансарда)', double: '2 этажа' },
  foundation: { pile: 'Свайно-винтовой', strip: 'Ленточный', slab: 'Монолитная плита', ushp: 'УШП' },
  roofMaterial: { metalTile: 'Металлочерепица', softRoofing: 'Мягкая черепица', standingSeam: 'Фальцевая' },
  roofShape: { gable: 'Двускатная', hip: 'Четырёхскатная', flat: 'Плоская' },
  style:    { classic: 'Классика', hitech: 'Хай-тек', chalet: 'Шале' },
  facade:   { plaster: 'Штукатурка', brick: 'Облицовочный кирпич', panel: 'Фасадная панель', none: 'Без фасада' },
  finishing: { shell: 'Коробка', rough: 'Черновая', whitebox: 'Вайт бокс', turnkeyEco: 'Под ключ Эконом', turnkeyStd: 'Под ключ Стандарт' },
  options:  { terrace: 'Терраса', garage: 'Гараж', bathhouse: 'Баня' },
};

function fmt(amount) {
  return Math.round(amount).toLocaleString('ru-RU') + ' ₽';
}

function generateEstimatePDF(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 50;
    const R = 545;
    const W = R - L;

    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // ── Шапка ────────────────────────────────────────────────
    doc.fontSize(18).font('Helvetica-Bold').text('СТРОИТЕЛЬНАЯ СМЕТА', L, 50, { align: 'center', width: W });
    doc.fontSize(11).font('Helvetica').text('СтройДом · Дома из газобетона · МО и Калужская обл.', L, 72, { align: 'center', width: W });

    doc.moveTo(L, 92).lineTo(R, 92).lineWidth(1).stroke('#cccccc');

    // ── Клиент ────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica').fillColor('#333333');
    doc.text('Клиент:', L, 102, { continued: true }).font('Helvetica-Bold').text('  ' + (data.name || '—'));
    doc.font('Helvetica').text('Телефон:', L, doc.y + 4, { continued: true }).font('Helvetica-Bold').text('  ' + (data.phone || '—'));
    doc.font('Helvetica').text('Дата расчёта:', L, doc.y + 4, { continued: true }).font('Helvetica-Bold').text('  ' + dateStr);

    doc.moveTo(L, doc.y + 8).lineTo(R, doc.y + 8).lineWidth(0.5).stroke('#cccccc');
    const afterHeader = doc.y + 14;

    // ── Параметры дома ────────────────────────────────────────
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text('ПАРАМЕТРЫ ДОМА', L, afterHeader);
    doc.moveTo(L, doc.y + 2).lineTo(R, doc.y + 2).lineWidth(0.5).stroke('#2AABEE');
    doc.moveDown(0.5);

    const params = [
      ['Регион',           LABELS.region[data.region] || data.region || '—'],
      ['Площадь',          (data.area || '—') + ' м²'],
      ['Этажность',        LABELS.floors[data.floors] || data.floors || '—'],
      ['Фундамент',        LABELS.foundation[data.foundation] || data.foundation || '—'],
      ['Кровля (материал)',LABELS.roofMaterial[data.roofMaterial] || data.roofMaterial || '—'],
      ['Кровля (форма)',   LABELS.roofShape[data.roofShape] || data.roofShape || '—'],
      ['Стиль',            LABELS.style[data.style] || data.style || '—'],
      ['Фасад',            LABELS.facade[data.facade] || data.facade || '—'],
      ['Отделка',          LABELS.finishing[data.finishing] || data.finishing || '—'],
    ];

    if (Array.isArray(data.options) && data.options.length > 0) {
      params.push(['Опции', data.options.map(o => LABELS.options[o] || o).join(', ')]);
    }

    doc.fontSize(10).font('Helvetica').fillColor('#333333');
    params.forEach(([label, value]) => {
      const y = doc.y;
      doc.font('Helvetica').fillColor('#666666').text(label + ':', L, y, { width: 160 });
      doc.font('Helvetica-Bold').fillColor('#000000').text(value, L + 165, y, { width: W - 165 });
      doc.moveDown(0.3);
    });

    // ── Смета ─────────────────────────────────────────────────
    doc.moveDown(0.8);
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text('СМЕТА');
    doc.moveTo(L, doc.y + 2).lineTo(R, doc.y + 2).lineWidth(0.5).stroke('#2AABEE');
    doc.moveDown(0.5);

    const breakdown = data.breakdown || {};
    const rows = [
      ['Фундамент',         breakdown.foundation],
      ['Коробка из газобетона', breakdown.box],
      ['Кровля',            breakdown.roof],
    ];
    if (breakdown.style > 0) rows.push(['Надбавка за стиль',  breakdown.style]);
    if (breakdown.facade > 0) rows.push(['Фасад',             breakdown.facade]);
    if (breakdown.finishing > 0) rows.push([LABELS.finishing[data.finishing] || 'Отделка', breakdown.finishing]);
    if (breakdown.options > 0) rows.push(['Дополнительные опции', breakdown.options]);
    if (breakdown.region > 0) rows.push(['Региональная надбавка', breakdown.region]);

    doc.fontSize(10).font('Helvetica').fillColor('#333333');
    rows.forEach(([label, amount]) => {
      if (!amount && amount !== 0) return;
      const y = doc.y;
      doc.font('Helvetica').fillColor('#333333').text(label, L, y, { width: W - 120 });
      doc.font('Helvetica-Bold').fillColor('#000000').text(fmt(amount), L, y, { width: W, align: 'right' });
      doc.moveDown(0.35);
    });

    // Разделитель перед итогом
    doc.moveTo(L, doc.y + 4).lineTo(R, doc.y + 4).lineWidth(1).stroke('#000000');
    doc.moveDown(0.6);

    // ── Итог ──────────────────────────────────────────────────
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
    const totY = doc.y;
    doc.text('ИТОГО', L, totY, { width: W - 150 });
    doc.text('≈ ' + fmt(data.total), L, totY, { width: W, align: 'right' });
    doc.moveDown(0.4);

    doc.fontSize(10).font('Helvetica').fillColor('#555555');
    if (data.perSqm) {
      doc.text(fmt(data.perSqm) + ' за м²', L);
    }
    if (data.mortgage) {
      doc.text('Семейная ипотека 6% · 20 лет — от ' + fmt(data.mortgage) + ' в месяц', L);
    }

    // ── Подвал ────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(0.5).stroke('#cccccc');
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica').fillColor('#888888');
    doc.text('Смета носит ориентировочный характер (точность ±10–15%) и действительна 30 дней.', L, doc.y, { align: 'center', width: W });
    doc.text('Точная стоимость фиксируется в договоре после выезда инженера на объект.', L, doc.y + 12, { align: 'center', width: W });

    doc.end();
  });
}

module.exports = { generateEstimatePDF };
