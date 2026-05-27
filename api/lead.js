// api/lead.js — Vercel Serverless Function
// URL: POST /api/lead
// Env vars (задать в Vercel Dashboard → Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN  — токен бота из BotFather
//   TELEGRAM_CHAT_ID    — chat_id менеджера (узнать через @userinfobot)

const https = require('https');

const LABELS = {
  floors: {
    single: '1 этаж', mansard: '1,5 этажа (мансарда)', double: '2 этажа',
  },
  foundation: {
    pile: 'Свайно-винтовой', strip: 'Ленточный', slab: 'Монолитная плита', ushp: 'УШП',
  },
  roofMaterial: {
    metalTile: 'Металлочерепица', softRoofing: 'Мягкая черепица', standingSeam: 'Фальцевая',
  },
  roofShape: {
    gable: 'Двускатная', hip: 'Четырёхскатная', flat: 'Плоская',
  },
  style: {
    classic: 'Классика', hitech: 'Хай-тек', chalet: 'Шале',
  },
  finishing: {
    shell: 'Коробка', rough: 'Черновая', turnkeyEco: 'Под ключ Эконом', turnkeyStd: 'Под ключ Стандарт',
  },
  options: {
    terrace: 'Терраса', garage: 'Гараж', bathhouse: 'Баня',
  },
};

function formatPrice(amount) {
  return Math.round(amount).toLocaleString('ru-RU') + ' ₽';
}

function buildMessage(data) {
  const {
    name, phone, area, floors, foundation,
    roofMaterial, roofShape, style, finishing, options, total, tgUser,
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

  const tgInfo = tgUser
    ? `\n👤 Telegram: ${tgUser.username ? '@' + tgUser.username : tgUser.first_name + ' ' + (tgUser.last_name || '')}`
    : '';

  return [
    '🏠 *Новая заявка — Калькулятор*',
    '',
    `👤 Имя: ${name}`,
    `📞 Телефон: ${phone}`,
    tgInfo,
    '',
    `📐 Площадь: ${area} м², ${LABELS.floors[floors] || floors}`,
    `🧱 Материал: Газобетон`,
    `🏗 Фундамент: ${LABELS.foundation[foundation] || foundation}`,
    `🏠 Кровля: ${LABELS.roofMaterial[roofMaterial] || roofMaterial}, ${LABELS.roofShape[roofShape] || roofShape}`,
    `🎨 Стиль: ${LABELS.style[style] || style}`,
    `🔨 Отделка: ${LABELS.finishing[finishing] || finishing}`,
    `✨ Опции: ${optionsList}`,
    '',
    `💰 Расчёт клиента: ≈ ${formatPrice(total)}`,
    '',
    `🕐 ${moscowTime} МСК`,
  ]
    .filter(line => line !== null && line !== undefined && line !== '\n👤 Telegram: ')
    .join('\n');
}

function sendTelegramMessage(token, chatId, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id:    chatId,
      text,
      parse_mode: 'Markdown',
    });

    const options = {
      hostname: 'api.telegram.org',
      path:     `/bot${token}/sendMessage`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          parsed.ok ? resolve(parsed) : reject(new Error(parsed.description || 'Telegram API error'));
        } catch (e) {
          reject(e);
        }
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

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('Missing env vars: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return res.status(500).json({ ok: false, error: 'Server not configured' });
  }

  const data = req.body;

  if (!data || !data.name || !data.phone) {
    return res.status(400).json({ ok: false, error: 'name and phone are required' });
  }

  try {
    const message = buildMessage(data);
    await sendTelegramMessage(BOT_TOKEN, CHAT_ID, message);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Failed to send Telegram message:', err.message);
    return res.status(502).json({ ok: false, error: 'Failed to send notification' });
  }
};
