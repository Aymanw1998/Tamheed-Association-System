// middleware/authRequired.js
const jwt = require('jsonwebtoken');  // ملاحظة عربية

const requireAuth = (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';   // ملاحظة عربية
    // console.log(auth);
    const [type, token] = auth.split(' ');          // 'Bearer <token>'
    // console.log(type, token);
    if (type !== 'Bearer' || !token) {
      return res.status(401).json({ code: 'NO_TOKEN', message: 'Missing Authorization Bearer token' });
    }

    // ملاحظة عربية
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],                         // ملاحظة عربية
      clockTolerance: 5,                             // ملاحظة عربية
    });
    // console.log("payload",payload);
    // ملاحظة عربية
    req.user = { id: payload.id, tz: payload.tz, roles: payload.roles };
    next();                                          // ملاحظة عربية
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Access token expired' });
    }
    return res.status(401).json({ code: 'TOKEN_INVALID', message: 'Invalid access token' });
  }
}

// ملاحظة عربية
const ADMIN_ROLES = new Set(["ادارة", "إدارة", "الادارة", "الإدارة", "Ø§Ø¯Ø§Ø±Ø©"]);

function requireRole(...roles) {
  return (req, res, next) => {
    // console.log("roles", roles);
    // console.log("user", req.user);
    // console.log("roles", req.user.roles);
    req.user.roles = req.user.roles || [];
    let b = false;
    for (let r of roles) {
      if (
        req.user.roles.includes(r) ||
        (ADMIN_ROLES.has(r) && req.user.roles.some((role) => ADMIN_ROLES.has(String(role).trim())))
      ) {
        b = true;
        break;
      }
    }

    if (!b) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'لا توجد صلاحية' });
    }
    next();
  };
}

function requireSelfOrRole(paramName = 'tz', ...roles) {
  return (req, res, next) => {
    const requestedIdentity = String(req.params?.[paramName] || '').trim();
    const userId = String(req.user?.id || '').trim();
    const userTz = String(req.user?.tz || '').trim();

    if (requestedIdentity && (requestedIdentity === userTz || requestedIdentity === userId)) {
      return next();
    }

    return requireRole(...roles)(req, res, next);
  };
}

module.exports = { requireAuth, requireRole, requireSelfOrRole };
