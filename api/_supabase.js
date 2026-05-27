// api/_supabase.js — Общий Supabase-клиент для всех serverless functions
// Нижнее подчёркивание: не является API endpoint, Vercel игнорирует как route.
const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getSupabase() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

module.exports = { getSupabase };
