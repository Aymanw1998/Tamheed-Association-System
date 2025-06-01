const Schema = require("./user.model");
const jwt = require("jsonwebtoken");

const buildData = (body) => ({
    tz: body.tz,
    username: body.username,
    password: body.password,
    firstname: body.firstname,
    lastname: body.lastname,
    birth_date: body.birth_date,
    gender: body.gender,
    phone: body.phone,
    email: body.email,
    role: body.role,
    city: body.city,
    street: body.street,
});

// פונקציות יצירת טוקנים
const generateAccessToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });
};

const generateRefreshToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

// רישום משתמש חדש
const register = async (req, res) => {
    console.log("*********Start Register*************");
    try {
        const model = buildData(req.body);
        const schemaExists = await Schema.findOne({ username: model.username });
        if (schemaExists) return res.status(400).json({ message: 'المستخدم مسجل' });

        const schema = await Schema.create(model);
        const user = await Schema.findOne({ username: model.username });

        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);
        user.refreshToken = refreshToken;
        await user.save();

        res
          .cookie('refreshToken', refreshToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'Strict',
              maxAge: 7 * 24 * 60 * 60 * 1000,
          })
          .status(201)
          .json({ accessToken, user });

        console.log("*********End Register - Success*************");
    } catch (error) {
        console.error(error);
        return res.status(400).json({ message: error.message });
    }
};

// התחברות
const login = async (req, res) => {
    console.log("*********Start Login*************");
    const { username, password } = req.body;
    try {
        const user = await Schema.findOne({ username, password });
        if (!user) return res.status(400).json({ message: "اسم المستخم او كلمة السر ليست صحيحة" });

        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);
        const  expirationTime = Date.now() + 24 * 60* 60* 1000; 
        user.refreshToken = refreshToken;
        await user.save();
        console.log("*********End Login - Success*************");
        return res
          .cookie('refreshToken', refreshToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'Strict',
              maxAge: 7 * 24 * 60 * 60 * 1000,
          })
          .status(200)
          .json({ accessToken, user, expirationTime});
    } catch (error) {
        console.error(error);
        return res.status(400).json({ message: error.message });
    }
};

// רענון access token
const refreshAccessToken = async (req, res) => {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: 'لا يوجد Refresh Token' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const user = await Schema.findById(decoded.id);
        if (!user || user.refreshToken !== token)
            return res.status(403).json({ message: 'Token غير صالح' });

        const newAccessToken = generateAccessToken(user._id);
        res.status(200).json({ accessToken: newAccessToken });
    } catch (err) {
        return res.status(403).json({ message: 'Token منتهي الصلاحية أو غير صالح' });
    }
};

// התנתקות
const logout = async (req, res) => {
    const token = req.cookies.refreshToken;
    if (token) {
        const user = await Schema.findOne({ refreshToken: token });
        if (user) {
            user.refreshToken = null;
            await user.save();
        }
        res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'Strict' });
    }
    res.status(200).json({ message: 'تم تسجيل الخروج' });
};

// פונקציות CRUD נוספות:
const getAllU = async (req, res) => {
    try {
        const users = await Schema.find();
        return res.status(200).json(users);
    } catch (err) {
        console.log(`err: ${err}`);
        return res.status(500).json([]);
    }
};

const putU = async (req, res) => {
    try {
        const { id } = req.params;
        const model = buildData(req.body);
        const updated = await Schema.findByIdAndUpdate(id, model, { new: true });
        const all = await Schema.find();
        return res.status(200).json({ schema: all });
    } catch (err) {
        console.log(`err: ${err}`);
        return res.status(500).json([]);
    }
};

const deleteU = async (req, res) => {
    try {
        const { id } = req.params;
        await Schema.findByIdAndDelete(id);
        const all = await Schema.find();
        return res.status(200).json({ schema: all });
    } catch (err) {
        console.log(`err: ${err}`);
        return res.status(500).json([]);
    }
};

module.exports = {
    register,
    login,
    refreshAccessToken,
    logout,
    getAllU,
    putU,
    deleteU,
};
