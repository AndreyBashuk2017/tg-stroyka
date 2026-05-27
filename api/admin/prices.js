// api/admin/prices.js — GET /api/admin/prices, PUT /api/admin/prices
// Чтение и обновление цен (требует JWT).
const { verifyAdminToken } = require('../_jwt');
const { getSupabase }      = require('../_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method Not Allowed' });

  if (!verifyAdminToken(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'DB not configured' });

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('prices').select('*').eq('id', 'current').single();
    if (error || !data) return res.status(502).json({ ok: false, error: 'Prices not found' });
    return res.status(200).json({ ok: true, prices: data });
  }

  // PUT — обновляем цены и записываем историю
  const body = req.body;
  if (!body) return res.status(400).json({ ok: false, error: 'Body required' });

  // Берём текущие цены для истории
  const { data: current } = await supabase.from('prices').select('*').eq('id', 'current').single();

  if (current) {
    await supabase.from('prices_history').insert({
      prices_snapshot: current,
      changed_by: 'admin',
    });
  }

  const updates = {};
  const fieldMap = {
    boxPerSqm:    'box_per_sqm',
    foundation:   'foundation',
    roofMaterial: 'roof_material',
    roofShape:    'roof_shape',
    style:        'style',
    facade:       'facade',
    finishing:    'finishing',
    options:      'options',
    region:       'region',
  };

  Object.entries(fieldMap).forEach(([jsKey, dbKey]) => {
    if (body[jsKey] !== undefined) updates[dbKey] = body[jsKey];
  });

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('prices').update(updates).eq('id', 'current').select().single();
  if (error) return res.status(502).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true, prices: data });
};
