// middleware/authRequired.js
const jwt = require('jsonwebtoken');  // אימות חתימת JWT

const requireAuth = (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';   // קורא את הכותרת Authorization
    // console.log(auth);
    const [type, token] = auth.split(' ');          // 'Bearer <token>'
    // console.log(type, token);
    if (type !== 'Bearer' || !token) {
      return res.status(401).json({ code: 'NO_TOKEN', message: 'Missing Authorization Bearer token' });
    }

    // אימות הטוקן עם הסוד ACCESS
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],                         // אלגוריתם חתימה
      clockTolerance: 5,                             // "סקיו" קטן לשעון
    });
    // console.log("payload",payload);
    // שומר פרטים לשימוש בהמשך המסלול
    req.user = { id: payload.id, tz: payload.tz, roles: payload.roles };
    next();                                          // ממשיכים לראוטר הבא
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Access token expired' });
    }
    return res.status(401).json({ code: 'TOKEN_INVALID', message: 'Invalid access token' });
  }
}

// בדיקת תפקידים (אפשר להעביר כמה תפקידים)
function requireRole(...roles) {
  return (req, res, next) => {
    console.log("roles", roles);
    console.log("user", req.user);
    console.log("roles", req.user.roles);
    req.user.roles = req.user.roles || [];
    let b = false;
    for (let r of roles) {
      if (req.user.roles.includes(r)) {
        b = true;
        break;
      }
    }

    if (!b) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'אין הרשאה' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
