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
const aiRoutes = require('./routes/ai.routes');


const crypto = require("crypto")
//Lod env vars
dotenv.config({path: './config/.env'});
const { ensureSystemAdmin } = require('./scripts/ensureSystemAdmin');
//Craete app
const app = express();
app.use(logger);


// VERY TOP, right after app = express()
// ملاحظة عربية
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : [
      'http://localhost:3000',
      'http://10.0.0.30:3000',
      'http://192.168.169.221:3000',
      'http://tamheed-ramla.org',
      'http://www.tamheed-ramla.org',
      'https://tamheed-ramla.org',
      'https://www.tamheed-ramla.org',
      // ملاحظة عربية
      /^http:\/\/10\.0\.0\.\d+:3000$/, // ملاحظة عربية
    ];

const stringAllowedOrigins = new Set(ALLOWED_ORIGINS.filter((origin) => typeof origin === 'string'));
const patternAllowedOrigins = ALLOWED_ORIGINS.filter((origin) => origin instanceof RegExp);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);               // Postman/SSR
    if (stringAllowedOrigins.has(origin)) return cb(null, true);
    if (patternAllowedOrigins.some((pattern) => pattern.test(origin))) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight
app.set('trust proxy', 1); // ملاحظة عربية

//Middleware to parse JSON requests
app.use(express.json());
//Cookie parser when login user the token is saved in the server and send to http client
app.use(cookieParser());
//Prevent attects
app.use(helmet({ 
    frameguard: false, // ملاحظة عربية
  crossOriginResourcePolicy: false })); // ملاحظة عربية

app.use(mongoSanitize()); // Sanitize data for privent NoSql injection attack
app.use(xss()); // Prevent XSS attacks

// Routes
app.use('/api/lesson', require('./Entities/Lesson/Lesson.route'));
app.use('/api/user', require('./Entities/User/User.route'));
app.use('/api/auth', require('./Entities/User/Auth.route'))
app.use('/api/attendance', require('./Entities/Attendance/Attendance.route'))
app.use('/api/student', require('./Entities/Student/Student.route'))
app.use('/api/inviteToken', require('./Entities/InviteToken/InviteToken.route'))
app.use('/api/report', require('./Entities/Report/Report.route'));
app.use('/api/storage', require('./Entities/Storage/Storage.route'))
app.use("/api/ai", aiRoutes);
// **********************************AUTO_PROCCESS ***************************
// ملاحظة عربية
// cron.schedule("* * * * *", runDailyJobs, { timezone: "Asia/Jerusalem" });
// **********************************END - AUTO_PROCCESS ***************************


//Dev logging middleware
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}
// Route middleware
app.get('/', (req, res) => {console.log("Server is up and running");res.send('Server is up and running'); });


//must be after routes call
//for catch 500-400 errors
app.use(errorHandler);


// **********************************ALERTS POPUP***************************

const { eventsHandler, broadcast } = require('./utils/sse');
const { errorPublisher } = require('./utils/errorPublisher');


// ملاحظة عربية
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ملاحظة عربية
app.get('/api/events', eventsHandler);

// ملاحظة عربية
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/test-event', (req, res) => {
    broadcast({ level: 'success', title: 'اختبار', message: 'حدث اختبار من الخادم' });
    res.json({ ok: true });
  });

  app.get('/api/boom', (req, res, next) => {
    const err = new Error('سقوط تجريبي');
    err.status = 500;
    err.code = 'BOOM_EXAMPLE';
    next(err);
  });
}

// ملاحظة عربية
app.use(errorPublisher);
app.use(require("express").json({ limit: "50mb" }));
const StartServer = async () => {
  try {
    // ملاحظة عربية
    // await connectDB();
    await ensureSystemAdmin();
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
    })
  } catch (err) {
    console.error('Failed to connect to DB:', err);
    process.exit(1);
  }
}
StartServer();
