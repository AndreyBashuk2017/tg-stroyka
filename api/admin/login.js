// api/admin/login.js — POST /api/admin/login
// Проверяет пароль и выдаёт JWT для доступа к admin-endpoints.
// Env vars: ADMIN_PASSWORD, JWT_SECRET
const { signAdminToken } = require('../_jwt');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { password } = req.body || {};
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (!ADMIN_PASSWORD) {
    console.error('ADMIN_PASSWORD env var not set');
    return res.status(500).json({ ok: false, error: 'Not configured' });
  }

  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'Wrong password' });
  }

  const token = signAdminToken();
  return res.status(200).json({ ok: true, token });
};
