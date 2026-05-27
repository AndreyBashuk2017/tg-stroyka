// api/admin/leads/[id].js — GET /api/admin/leads/:id, PATCH /api/admin/leads/:id
// Получение полного лида и обновление статуса/заметок.
const { verifyAdminToken } = require('../../_jwt');
const { getSupabase }      = require('../../_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'Method Not Allowed' });

  if (!verifyAdminToken(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'DB not configured' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('leads').select('*').eq('id', id).single();
    if (error || !data) return res.status(404).json({ ok: false, error: 'Not found' });
    return res.status(200).json({ ok: true, lead: data });
  }

  // PATCH — обновляем только разрешённые поля
  const allowed = ['status', 'notes'];
  const updates = {};
  (req.body ? Object.keys(req.body) : []).forEach(key => {
    if (allowed.includes(key)) updates[key] = req.body[key];
  });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ ok: false, error: 'No valid fields to update' });
  }

  const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
  if (error) return res.status(502).json({ ok: false, error: error.message });
  return res.status(200).json({ ok: true, lead: data });
};
