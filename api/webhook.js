// api/webhook.js — POST /api/webhook
// Telegram Bot webhook: FAQ-ответы по шагам + команда /addphoto для собственника.
// Env vars:
//   TELEGRAM_BOT_TOKEN       — токен бота
//   TELEGRAM_WEBHOOK_SECRET  — секрет для X-Telegram-Bot-Api-Secret-Token
//   TELEGRAM_OWNER_ID        — Telegram user_id собственника (для /addphoto)
//   SUPABASE_URL + SUPABASE_SERVICE_KEY

const https = require('https');
const { getSupabase } = require('./_supabase');

function tgRequest(token, method, body) {
  return new Promise((resolve, reject) => {
    const raw = JSON.stringify(body);
    const opts = {
      hostname: 'api.telegram.org',
      path:     `/bot${token}/${method}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(raw);
    req.end();
  });
}

module.exports = async (req, res) => {
  // Проверка секретного токена
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const OWNER_ID  = process.env.TELEGRAM_OWNER_ID ? Number(process.env.TELEGRAM_OWNER_ID) : null;
  const update    = req.body;

  if (!BOT_TOKEN || !update) return res.status(200).end();

  const supabase = getSupabase();

  // ── callback_query (инлайн-кнопки) ────────────────────────
  if (update.callback_query) {
    const cq = update.callback_query;
    await tgRequest(BOT_TOKEN, 'answerCallbackQuery', { callback_query_id: cq.id });

    const [action, step] = (cq.data || '').split(':');

    if (action === 'faq' && step && supabase) {
      const { data: items } = await supabase.from('faq').select('question, answer').eq('step', step).order('sort_order');
      if (items && items.length > 0) {
        const text = items.map(i => `*${i.question}*\n${i.answer}`).join('\n\n');
        await tgRequest(BOT_TOKEN, 'sendMessage', {
          chat_id: cq.message.chat.id,
          text,
          parse_mode: 'Markdown',
        });
      }
    }

    return res.status(200).end();
  }

  // ── Текстовые сообщения ───────────────────────────────────
  const msg    = update.message;
  if (!msg) return res.status(200).end();

  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text   = msg.text || '';

  // /start
  if (text === '/start') {
    await tgRequest(BOT_TOKEN, 'sendMessage', {
      chat_id: chatId,
      text: 'Привет! Я помогу вам узнать стоимость строительства дома.\n\nИспользуйте кнопку меню, чтобы открыть калькулятор.',
    });
    return res.status(200).end();
  }

  // /addphoto — только для собственника
  if (text === '/addphoto') {
    if (OWNER_ID && userId !== OWNER_ID) {
      await tgRequest(BOT_TOKEN, 'sendMessage', { chat_id: chatId, text: 'Нет доступа.' });
      return res.status(200).end();
    }

    if (supabase) {
      await supabase.from('bot_sessions').upsert({
        tg_user_id: userId,
        state:      'addphoto_await_title',
        data:       {},
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
    }

    await tgRequest(BOT_TOKEN, 'sendMessage', {
      chat_id: chatId,
      text: 'Добавление фото в портфолио.\n\nВведите *название объекта* (например: "Дом 120 м², Классика, Калуга"):',
      parse_mode: 'Markdown',
    });
    return res.status(200).end();
  }

  // ── Обработка multi-step /addphoto ───────────────────────
  if (supabase && OWNER_ID && userId === OWNER_ID) {
    const { data: session } = await supabase
      .from('bot_sessions')
      .select('state, data')
      .eq('tg_user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (session) {
      const state = session.state;
      const sData = session.data || {};

      if (state === 'addphoto_await_title') {
        await supabase.from('bot_sessions').update({
          state: 'addphoto_await_photo',
          data:  { ...sData, title: text },
        }).eq('tg_user_id', userId);

        await tgRequest(BOT_TOKEN, 'sendMessage', {
          chat_id: chatId,
          text: `Название: *${text}*\n\nТеперь отправьте *фото объекта*:`,
          parse_mode: 'Markdown',
        });
        return res.status(200).end();
      }

      if (state === 'addphoto_await_photo') {
        const photo = msg.photo?.[msg.photo.length - 1];
        if (!photo) {
          await tgRequest(BOT_TOKEN, 'sendMessage', { chat_id: chatId, text: 'Отправьте фото (не файл).' });
          return res.status(200).end();
        }

        // Получаем URL файла
        const fileRes = await tgRequest(BOT_TOKEN, 'getFile', { file_id: photo.file_id });
        const filePath = fileRes.result?.file_path;
        const photoUrl = filePath
          ? `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
          : null;

        await supabase.from('portfolio').insert({
          title:     sData.title,
          photo_url: photoUrl,
        });

        await supabase.from('bot_sessions').delete().eq('tg_user_id', userId);

        await tgRequest(BOT_TOKEN, 'sendMessage', {
          chat_id: chatId,
          text: `✅ Объект *${sData.title}* добавлен в портфолио!`,
          parse_mode: 'Markdown',
        });
        return res.status(200).end();
      }
    }
  }

  return res.status(200).end();
};
