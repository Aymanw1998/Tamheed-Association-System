const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TOKEN_TTL_SEC  = Number(process.env.JWT_ACCESS_TTL_SEC ||  1 * 24 * 60 * 60);   // 15 דק'
const REFRESH_TOKEN_TTL_SEC = Number(process.env.JWT_REFRESH_TTL_SEC || 7 * 24 * 60 * 60); // 7 ימים

exports.signAccessToken = (payload) => jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL_SEC });

exports.signRefreshToken = (payload) => jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { algorithm: 'HS256', expiresIn: REFRESH_TOKEN_TTL_SEC });

exports.computeAccessExpMsFromNow = () => Date.now() + ACCESS_TOKEN_TTL_SEC * 1000;

exports.sha256 = (str) => crypto.createHash('sha256').update(String(str)).digest('hex');

exports.setRefreshCookie = (res, token) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('refresh', token, {
    httpOnly: true,
    secure: true,           // true ב-HTTPS
    sameSite: 'None',   // כדי לעבור cross-site
    domain: 'fitness360-suji.onrender.com', // לא חובה, אפשר להשאיר בליINERS
  });
};

exports.clearRefreshCookie = (res) => res.clearCookie('refresh', { path: '/' });
