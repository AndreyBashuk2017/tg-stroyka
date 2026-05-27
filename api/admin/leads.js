// api/admin/leads.js — GET /api/admin/leads
// Возвращает список лидов (требует JWT).
const { verifyAdminToken } = require('../_jwt');
const { getSupabase }      = require('../_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!verifyAdminToken(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'DB not configured' });

  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '50');
  const from  = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('leads')
    .select('id, created_at, name, phone, region, area, floors, total, status, pdf_url', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    console.error('Leads fetch error:', error.message);
    return res.status(502).json({ ok: false, error: 'DB error' });
  }

  return res.status(200).json({ ok: true, leads: data || [], total: count || 0, page, limit });
};
