// api/faq.js — GET /api/faq?step=foundation
// Возвращает список FAQ-вопросов по шагу калькулятора.
const { getSupabase } = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { step } = req.query;
  if (!step) return res.status(400).json({ ok: false, error: 'step param required' });

  const supabase = getSupabase();
  if (!supabase) return res.status(200).json({ ok: true, items: [] });

  const { data, error } = await supabase
    .from('faq')
    .select('question, answer')
    .eq('step', step)
    .order('sort_order');

  if (error) {
    console.error('FAQ fetch error:', error.message);
    return res.status(502).json({ ok: false, error: 'DB error' });
  }

  res.setHeader('Cache-Control', 'public, max-age=600');
  return res.status(200).json({ ok: true, items: data || [] });
};
