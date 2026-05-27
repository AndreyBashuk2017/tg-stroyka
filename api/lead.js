// api/lead.js — Vercel Serverless Function
// URL: POST /api/lead
// Env vars (Vercel Dashboard → Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN   — токен бота из BotFather
//   TELEGRAM_CHAT_ID     — chat_id менеджера (узнать через @userinfobot)
//   SUPABASE_URL         — URL проекта Supabase (опционально)
//   SUPABASE_SERVICE_KEY — service_role ключ Supabase (опционально)

const https = require('https');
const { getSupabase } = require('./_supabase');
const { generateEstimatePDF } = require('./pdf-template');

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

function formatPrice(amount) {
  return Math.round(amount).toLocaleString('ru-RU') + ' ₽';
}

function buildMessage(data, leadId) {
  const {
    name, phone, region, area, floors, foundation,
    roofMaterial, roofShape, style, facade, finishing, options, total, tgUser,
  } = data;

  const now = new Date();
  const moscowTime = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(now);

  const optionsList = Array.isArray(options) && options.length > 0
    ? options.map(o => LABELS.options[o] || o).join(', ')
    : 'Нет';

  const tgLine = tgUser
    ? (tgUser.username ? '@' + tgUser.username : (tgUser.first_name || '') + ' ' + (tgUser.last_name || '')).trim()
    : null;

  const lines = [
    '🏠 *Новая заявка — Калькулятор*',
    '',
    `👤 Имя: ${name}`,
    `📞 Телефон: ${phone}`,
    tgLine ? `💬 Telegram: ${tgLine}` : null,
    '',
    `🗺 Регион: ${LABELS.region[region] || region || '—'}`,
    `📐 Площадь: ${area} м², ${LABELS.floors[floors] || floors}`,
    `🧱 Материал: Газобетон`,
    `🏗 Фундамент: ${LABELS.foundation[foundation] || foundation}`,
    `🏠 Кровля: ${LABELS.roofMaterial[roofMaterial] || roofMaterial}, ${LABELS.roofShape[roofShape] || roofShape}`,
    `🎨 Стиль: ${LABELS.style[style] || style}`,
    `🏛 Фасад: ${LABELS.facade[facade] || facade || '—'}`,
    `🔨 Отделка: ${LABELS.finishing[finishing] || finishing}`,
    `✨ Опции: ${optionsList}`,
    '',
    `💰 Расчёт клиента: ≈ ${formatPrice(total)}`,
    leadId ? `🔑 ID: ${leadId}` : null,
    '',
    `🕐 ${moscowTime} МСК`,
  ];

  return lines.filter(l => l !== null).join('\n');
}

function sendTelegramMessage(token, chatId, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
    const options = {
      hostname: 'api.telegram.org',
      path:     `/bot${token}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          parsed.ok ? resolve(parsed) : reject(new Error(parsed.description || 'Telegram API error'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('Missing env: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return res.status(500).json({ ok: false, error: 'Server not configured' });
  }

  const data = req.body;
  if (!data || !data.name || !data.phone) {
    return res.status(400).json({ ok: false, error: 'name and phone are required' });
  }

  let leadId = null;
  let pdfUrl = null;

  // ── Сохранение в Supabase ──────────────────────────────────
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: lead, error } = await supabase.from('leads').insert({
        name:          data.name,
        phone:         data.phone,
        region:        data.region        || null,
        area:          data.area          || null,
        floors:        data.floors        || null,
        foundation:    data.foundation    || null,
        roof_material: data.roofMaterial  || null,
        roof_shape:    data.roofShape     || null,
        style:         data.style         || null,
        facade:        data.facade        || null,
        finishing:     data.finishing     || null,
        options:       data.options       || [],
        total:         data.total         || null,
        tg_user_id:    data.tgUser ? data.tgUser.id        : null,
        tg_username:   data.tgUser ? data.tgUser.username  : null,
      }).select('id').single();

      if (!error && lead) {
        leadId = lead.id;
      }
    } catch (err) {
      console.error('Supabase insert error:', err.message);
    }

    // ── Генерация и загрузка PDF ───────────────────────────
    if (leadId) {
      try {
        const pdfBuffer = await generateEstimatePDF({
          ...data,
          breakdown: data.breakdown || {},
          perSqm:    data.perSqm   || null,
          mortgage:  data.mortgage || null,
        });

        const { data: stored, error: storageErr } = await supabase.storage
          .from('pdfs')
          .upload(`${leadId}.pdf`, pdfBuffer, { contentType: 'application/pdf', upsert: true });

        if (!storageErr) {
          const { data: urlData } = supabase.storage.from('pdfs').getPublicUrl(`${leadId}.pdf`);
          pdfUrl = urlData?.publicUrl || null;

          if (pdfUrl) {
            await supabase.from('leads').update({ pdf_url: pdfUrl }).eq('id', leadId);
          }
        }
      } catch (err) {
        console.error('PDF generation/upload error:', err.message);
      }
    }
  }

  // ── Отправка в Telegram ────────────────────────────────────
  try {
    const message = buildMessage(data, leadId);
    await sendTelegramMessage(BOT_TOKEN, CHAT_ID, message);

    if (supabase && leadId) {
      await supabase.from('leads').update({ manager_notified: true }).eq('id', leadId);
    }
  } catch (err) {
    console.error('Telegram send error:', err.message);
    return res.status(502).json({ ok: false, error: 'Failed to send notification' });
  }

  return res.status(200).json({ ok: true, pdfUrl });
};
