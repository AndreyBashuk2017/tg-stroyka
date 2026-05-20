// lead.js — Netlify Function. Принимает данные лида и отправляет уведомление в Telegram.
// URL: POST /.netlify/functions/lead
// Env vars (задать в Netlify Dashboard → Site configuration → Environment variables):
//   TELEGRAM_BOT_TOKEN  — токен бота из BotFather
//   TELEGRAM_CHAT_ID    — chat_id менеджера (узнать через @userinfobot)

const https = require('https');

// Русские метки для параметров
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

  // Дата и время по Москве
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

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('Missing env vars: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: 'Server not configured' }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid JSON' }) };
  }

  // Валидация обязательных полей
  if (!data.name || !data.phone) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'name and phone are required' }) };
  }

  try {
    const message = buildMessage(data);
    await sendTelegramMessage(BOT_TOKEN, CHAT_ID, message);

    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('Failed to send Telegram message:', err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ ok: false, error: 'Failed to send notification' }),
    };
  }
};
