const jwt = require("jsonwebtoken");

const verifyOnlyOfficeJwt = (req, res, next) => {
    const secret = process.env.ONLYOFFICE_JWT_SECRET;

    // 1) הכי נפוץ: token מגיע ב-Authorization header
    const auth = req.headers.authorization || "";
    let token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    // 2) בחלק מההגדרות: token מגיע בתוך body
    if (!token && req.body && req.body.token) token = req.body.token;

    if (!token) return res.status(401).json({ message: "Missing OnlyOffice JWT" });

    try {
        req.onlyofficeJwt = jwt.verify(token, secret);
        return next();
    } catch (e) {
        return res.status(401).json({ message: "Invalid OnlyOffice JWT" });
    }
}

module.exports = { verifyOnlyOfficeJwt };
