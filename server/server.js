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

const crypto = require("crypto")
//Lod env vars
dotenv.config({path: './config/.env'});
//Craete app
const app = express();
//Connect to DB
connectDB();
//Middleware to parse JSON requests
app.use(express.json());
//Cookie parser when login user the token is saved in the server and send to http client
app.use(cookieParser());

//Prevent attects
app.use(mongoSanitize()); // Sanitize data for privent NoSql injection attack
app.use(helmet()); // Set security headers
app.use(xss()); // Prevent XSS attacks

//Enable CORS
app.use(cors());
app.all('*', function (req, res, next) {
  if (!req.get('Origin')) return next();
  res.set('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE');
  res.set(
    'Access-Control-Allow-Headers',
    'X-Requested-With,Content-Type,authorization'
  );
  next();
});

// Routes
app.use('/api/student', require('./Student/student.route'));
app.use('/api/user', require('./User/user.route'))
app.use('/api/auth', require('./User/auth.route'))


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


//Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
// Route middleware
app.get('/', (req, res) => {console.log("Server is up and running");res.send('Server is up and running'); });


//must be after routes call
//for catch 500-400 errors
app.use(errorHandler);

const httpServer = http.createServer(app)
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV;
httpServer.listen(
  PORT,"0.0.0.0",
 console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`.blue.bold)
);

//Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
 //console.log(`Error: ${err.message}`.red);
  // Close server & exit process
  httpServer.close(() => process.exit(1));
});