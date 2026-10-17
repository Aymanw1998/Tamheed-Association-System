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

module.exports = { requireAuth };
