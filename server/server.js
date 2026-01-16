const path = require('path');
const http = require('http');
const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const colors = require('colors');
const cookieParser = require('cookie-parser');

const errorHandler = require('./middleware/err');
const connectDB = require('./config/db');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const xss = require('xss-clean');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
const {logger} = require('./middleware/logger');


const crypto = require("crypto")
//Lod env vars
dotenv.config({path: './config/.env'});
//Craete app
const app = express();
app.use(logger);

//Connect to DB
connectDB();


// VERY TOP, right after app = express()
// מומלץ דרך ENV כדי שלא תצטרך לקמפל מחדש
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : [
      'http://localhost:3000',
      'https://fitness-360.onrender.com', // הקליינט בפרודקשן
      'http://10.0.0.30:3000',
      'http://192.168.169.221:3000',
      'http://tamheed-ramla.org:3000',
      'http://www.tamheed-ramla.org:3000',
      // הוסף כאן דומיינים נוספים אם יש
      /^http:\/\/10\.0\.0\.\d+3000$/, // רשת LAN לדיבוג
    ];

const allowedOrigins = new Set(ALLOWED_ORIGINS);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);               // Postman/SSR
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight
app.set('trust proxy', 1); // חשוב ברנדר בשביל cookies Secure

//Middleware to parse JSON requests
app.use(express.json());
//Cookie parser when login user the token is saved in the server and send to http client
app.use(cookieParser());
//Prevent attects
app.use(helmet({ 
    frameguard: false, // ⬅️ קריטי ל-OnlyOffice
  crossOriginResourcePolicy: false })); // לא לחסום משאבים cross-origin

app.use(mongoSanitize()); // Sanitize data for privent NoSql injection attack
app.use(xss()); // Prevent XSS attacks

// **********************************GOOGLE DRIVE ***************************
app.use('/api/google', require('./Entities/Drive/google.route'));

// Routes
app.use('/api/lesson', require('./Entities/Lesson/Lesson.route'));
app.use('/api/user', require('./Entities/User/User.route'));
app.use('/api/auth', require('./Entities/User/Auth.route'))
app.use('/api/attendance', require('./Entities/Attendance/Attendance.route'))
app.use('/api/student', require('./Entities/Student/Student.route'))
app.use('/api/inviteToken', require('./Entities/InviteToken/InviteToken.route'))
app.use('/api/report', require('./Entities/Report/Report.route'));
app.use('/api/doc', require('./Entities/Doc/Doc.route'));
app.use('/api/onlyoffice', require('./Entities/OnlyOffice/OnlyOffice.route'));
// **********************************AUTO_PROCCESS ***************************
const cron = require("node-cron");
const { runDailyJobs } = require("./utils/daily");

// ירוץ כל יום בחצות לפי שעון ישראל
cron.schedule("0 0 1 * *", async () => {
  try {
    console.time("[daily]");
    await runDailyJobs();
  } catch (err) {
    console.error("[daily] error:", err);
  } finally {
    console.timeEnd("[daily]");
  }
}, { timezone: "Asia/Jerusalem" });

// בזמן פיתוח אפשר לבדוק כל דקה:
// cron.schedule("* * * * *", runDailyJobs, { timezone: "Asia/Jerusalem" });
// **********************************END - AUTO_PROCCESS ***************************


// **********************************CLOUDINARY_SERVER***************************
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER;

app.get('/healthz', async (req, res) => {
  try {
    // 1. בדיקת MongoDB
    await mongoose.connection.db.admin().ping();

    // 2. בדיקת שירות Cloudinary עם קריאה פשוטה לחשבון
    const cloudinaryResponse = await axios.get(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}`,
      {
        auth: {
          username: CLOUDINARY_API_KEY,
          password: CLOUDINARY_API_SECRET,
        },
      }
    );

    // 3. הצלחנו להגיע גם למונגו וגם לקלאודינרי
    res.status(200).json({
      status: 'healthy',
      mongo: 'connected',
      cloudinary: 'reachable',
      uptime: process.uptime(),
      timestamp: new Date(),
    });
  } catch (error) {

    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date(),
    });
  }
});

app.get('/api/cloudinary-signature', (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  console.log("upload image 0 ", timestamp);
  // אפשר להוסיף פרמטרים נוספים אם תרצה (folder, eager וכו')
  const params_to_sign = { timestamp, folder: CLOUDINARY_FOLDER };

  // סדר אלפביתי ויצירת מחרוזת חתימה
  const string_to_sign = Object.entries(params_to_sign)
    .sort()
    .map(([key, val]) => `${key}=${val}`)
    .join('&');

  // יצירת חתימה עם SHA1
  const signature = crypto
    .createHash('sha1')
    .update(string_to_sign + CLOUDINARY_API_SECRET)
    .digest('hex');
  console.log("upload image", signature, timestamp, CLOUDINARY_API_KEY, CLOUDINARY_CLOUD_NAME);
  return res.status(200).json({
    signature,
    timestamp,
    api_key: CLOUDINARY_API_KEY,
    cloud_name: CLOUDINARY_CLOUD_NAME,
    folder: CLOUDINARY_FOLDER,
  });
});

// **********************************END - CLOUDINARY_SERVER***************************

//Dev logging middleware
app.use(morgan('dev'));
// Route middleware
app.get('/', (req, res) => {console.log("Server is up and running");res.send('Server is up and running'); });


//must be after routes call
//for catch 500-400 errors
app.use(errorHandler);


// **********************************ALERTS POPUP***************************

const { eventsHandler, broadcast } = require('./utils/sse');
const { errorPublisher } = require('./utils/errorPublisher');

// בריאות
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ערוץ SSE
app.get('/api/events', eventsHandler);

// דוגמה לאירוע יזום
app.get('/api/test-event', (req, res) => {
  broadcast({ level: 'success', title: 'בדיקה', message: 'אירוע בדיקה מהשרת' });
  res.json({ ok: true });
});

// שגיאה יזומה לבדיקה
app.get('/api/boom', (req, res, next) => {
  const err = new Error('נפילה לדוגמה');
  err.status = 500;
  err.code = 'BOOM_EXAMPLE';
  next(err);
});

// ⬅️ שים לפני error handler הראשי
app.use(errorPublisher);
app.use(require("express").json({ limit: "50mb" }));

// **********************************END - ALERTS POPUP***************************
const httpServer = http.createServer(app)
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV;
httpServer.listen(PORT,"0.0.0.0",console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`.blue.bold));


// 1. Unhandled Promise Rejection (async errors)
process.on('unhandledRejection', (err, promise) => {
  console.error('💥 Unhandled Rejection:', err.message);
  console.error(err.stack);
  httpServer.close(() => process.exit(1));
});

// 2. Uncaught Exceptions (sync errors not caught in try/catch)
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err.message);
  console.error(err.stack);
  process.exit(1); // Exit immediately
});
