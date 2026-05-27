// api/_jwt.js — JWT-авторизация для admin endpoints
const jwt = require('jsonwebtoken');

function signAdminToken() {
  return jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '8h' });
}

function verifyAdminToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'dev-secret');
  } catch {
    return null;
  }
}

module.exports = { signAdminToken, verifyAdminToken };
