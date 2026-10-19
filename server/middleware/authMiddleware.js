// middleware/authRequired.js
const jwt = require('jsonwebtoken');  // ملاحظة عربية

const PASSWORD_CHANGE_SCOPE = 'password-change';
const PASSWORD_CHANGE_REQUIRED = { code: 'PASSWORD_CHANGE_REQUIRED', message: 'يجب تغيير كلمة المرور أولًا' };

// A scoped token (scope: "password-change", issued when the system account's
// password has expired) is refused everywhere except routes that opt in.
const createRequireAuth = ({ allowPasswordChange = false } = {}) => (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';   // ملاحظة عربية
    const [type, token] = auth.split(' ');          // 'Bearer <token>'
    if (type !== 'Bearer' || !token) {
      return res.status(401).json({ code: 'NO_TOKEN', message: 'Missing Authorization Bearer token' });
    }

    // ملاحظة عربية
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],                         // ملاحظة عربية
      clockTolerance: 5,                             // ملاحظة عربية
    });
    if (payload.scope && !(allowPasswordChange && payload.scope === PASSWORD_CHANGE_SCOPE)) {
      return res.status(403).json(PASSWORD_CHANGE_REQUIRED);
    }
    // ملاحظة عربية
    // iat lets loadActor and getme refuse a token older than the password.
    req.user = { id: payload.id, tz: payload.tz, roles: payload.roles, iat: payload.iat, ...(payload.scope ? { scope: payload.scope } : {}) };
    next();                                          // ملاحظة عربية
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Access token expired' });
    }
    return res.status(401).json({ code: 'TOKEN_INVALID', message: 'Invalid access token' });
  }
};

const requireAuth = createRequireAuth();
// Only for POST /api/auth/change-password.
const requireAuthAllowingPasswordChange = createRequireAuth({ allowPasswordChange: true });

module.exports = { requireAuth, requireAuthAllowingPasswordChange, PASSWORD_CHANGE_REQUIRED };
