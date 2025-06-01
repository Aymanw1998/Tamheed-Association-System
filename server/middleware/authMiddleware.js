const jwt = require('jsonwebtoken');
const User = require('../User/user.model');

// Middleware להגנה על נתיבים עם Access Token
const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token;

  if (authHeader && authHeader.startsWith('Bearer')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'غير مصرح - لا يوجد Access Token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'المستخدم غير موجود' });
    }

    next();
  } catch (error) {
    console.log("***** Error in protect *******", error);
    return res.status(401).json({ message: 'رمز غير صالح أو منتهي الصلاحية' });
  }
};

// Middleware לבדוק תפקיד
const protectRole = (role) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: 'ليس لديك صلاحية الوصول لهذا المورد' });
    }
    next();
  };
};

module.exports = { protect, protectRole };
