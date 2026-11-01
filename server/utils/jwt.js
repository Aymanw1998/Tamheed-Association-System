const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Signed in until signing out (owner, 2026-11-01): the refresh token lasts a
// year and every refresh issues a new one, so only a year without any visit
// ends a session. The access token stays short, so a sign-out by an admin
// (signedOutAt, utils/systemPassword) or a closed account takes effect soon.
const ACCESS_TOKEN_TTL_SEC  = Number(process.env.JWT_ACCESS_TTL_SEC  || 15 * 60);
const REFRESH_TOKEN_TTL_SEC = Number(process.env.JWT_REFRESH_TTL_SEC || 365 * 24 * 60 * 60);
exports.ACCESS_TOKEN_TTL_SEC = ACCESS_TOKEN_TTL_SEC;
exports.REFRESH_TOKEN_TTL_SEC = REFRESH_TOKEN_TTL_SEC;

// payload.scope (e.g. "password-change") limits what the token may do; see
// middleware/authMiddleware.js. expiresInSec shortens a scoped token's life.
exports.signAccessToken = (payload, { expiresInSec } = {}) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256', expiresIn: expiresInSec || ACCESS_TOKEN_TTL_SEC });

// Each refresh token gets its own id (jwtid): two signed in the same second
// for the same user would otherwise be identical, and a device's rotation
// would then end the other device's session too (utils/refreshSessions).
exports.signRefreshToken = (payload) => jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { algorithm: 'HS256', expiresIn: REFRESH_TOKEN_TTL_SEC, jwtid: crypto.randomUUID() });

exports.computeAccessExpMsFromNow = () => Date.now() + ACCESS_TOKEN_TTL_SEC * 1000;

exports.sha256 = (str) => crypto.createHash('sha256').update(String(str)).digest('hex');

const refreshCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,                 // prod فقط
    sameSite: isProd ? "None" : "Lax",
    path: "/",
    domain: isProd ? ".tamheed-ramla.org" : undefined,
  };
};

// maxAge keeps the cookie after the browser closes; clearing uses the same
// options without it.
exports.setRefreshCookie = (res, token) => {
  res.cookie("refresh", token, { ...refreshCookieOptions(), maxAge: REFRESH_TOKEN_TTL_SEC * 1000 });
};

exports.clearRefreshCookie = (res) => res.clearCookie('refresh', refreshCookieOptions());
