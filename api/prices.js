// api/prices.js — GET /api/prices
// Возвращает актуальные цены из Supabase. Fallback — захардкоженные значения.
const { getSupabase } = require('./_supabase');

const FALLBACK_PRICES = {
  boxPerSqm:    { single: 22000, mansard: 20000, double: 19000 },
  foundation:   { pile: 4000, strip: 7000, slab: 10000, ushp: 16000 },
  roofMaterial: { metalTile: 1.0, softRoofing: 1.08, standingSeam: 1.15 },
  roofShape:    { gable: 1.0, hip: 1.12, flat: 0.95 },
  style:        { classic: 1.0, hitech: 1.10, chalet: 1.18 },
  facade:       { plaster: 3500, brick: 8000, panel: 5500, none: 0 },
  finishing:    { shell: 0, rough: 7000, whitebox: 10000, turnkeyEco: 12000, turnkeyStd: 22000 },
  options:      { terrace: 200000, garage: 380000, bathhouse: 420000 },
  region:       { kaluga: 1.0, obninsk: 1.0, moscow_obl: 1.15, new_moscow: 1.15 },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(200).json({ ok: true, prices: FALLBACK_PRICES, source: 'fallback' });
  }

  const { data, error } = await supabase
    .from('prices')
    .select('*')
    .eq('id', 'current')
    .single();

  if (error || !data) {
    console.error('Prices fetch error:', error?.message);
    return res.status(200).json({ ok: true, prices: FALLBACK_PRICES, source: 'fallback' });
  }

  const prices = {
    boxPerSqm:    data.box_per_sqm,
    foundation:   data.foundation,
    roofMaterial: data.roof_material,
    roofShape:    data.roof_shape,
    style:        data.style,
    facade:       data.facade,
    finishing:    data.finishing,
    options:      data.options,
    region:       data.region,
  };

  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ ok: true, prices, source: 'db' });
};
