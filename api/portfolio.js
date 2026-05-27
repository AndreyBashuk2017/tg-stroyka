// api/portfolio.js — GET /api/portfolio
// Возвращает видимые объекты портфолио.
const { getSupabase } = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(200).json({ ok: true, items: [] });

  const { data, error } = await supabase
    .from('portfolio')
    .select('id, title, area, floors, style, description, photo_url')
    .eq('is_visible', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Portfolio fetch error:', error.message);
    return res.status(502).json({ ok: false, error: 'DB error' });
  }

  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ ok: true, items: data || [] });
};
