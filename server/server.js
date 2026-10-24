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
const { skipFor } = require('./middleware/skipFor');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
const {logger} = require('./middleware/logger');
const aiRoutes = require('./routes/ai.routes');


const path = require('path');
const crypto = require("crypto")
//Lod env vars
dotenv.config({path: './config/.env'});
const { ensureSystemAdmin } = require('./scripts/ensureSystemAdmin');
const { createFatalShutdown } = require('./utils/fatalShutdown');
const { sportStatic } = require('./utils/sportHost');
//Craete app
const app = express();
app.use(logger);


// The client calls /api on its own origin (dev: CRA proxy, production: this
// server serves the built app), so same-origin requests need no configuration
// and work for any host or IP. ALLOWED_ORIGINS only lists extra *cross-origin*
// callers; by default that is just the local dev server.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = new Set(ALLOWED_ORIGINS);

const isSameOrigin = (req, origin) => {
  try {
    // Behind a proxy the original host is in X-Forwarded-Host, but a proxy that
    // doesn't rewrite Origin (or rewrites it to its own target, as CRA's dev
    // proxy does) leaves it matching Host instead - accept either.
    const originHost = new URL(origin).host;
    return [req.get('x-forwarded-host'), req.get('host')].some((host) => host && host === originHost);
  } catch {
    return false;
  }
};

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!origin || isSameOrigin(req, origin) || allowedOrigins.has(origin)) return next();
  return res.status(403).json({ code: 'CORS_ORIGIN_DENIED', message: `Origin not allowed: ${origin}` });
});

const corsOptions = {
  origin: true, // the guard above already rejected unknown origins
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight
app.set('trust proxy', 1); // ملاحظة عربية

// Optional: serve the built client from this same server (SERVE_CLIENT=true),
// so opening http://<server-ip>:<port> loads the app and /api on one origin.
// Mounted before helmet so the CRA bundle isn't subject to helmet's default CSP.
if (process.env.SERVE_CLIENT === 'true') {
  const clientBuild = path.join(__dirname, '..', 'client', 'build');
  // The sport site on its own host name; must come before the system client.
  app.use(sportStatic(path.join(__dirname, '..', 'sport', 'dist'), process.env.SPORT_HOST));
  app.use(express.static(clientBuild));
  app.get(/^\/(?!api(\/|$)).*/, (req, res, next) =>
    req.accepts('html') ? res.sendFile(path.join(clientBuild, 'index.html')) : next()
  );
}

//Middleware to parse JSON requests
app.use(express.json());
//Cookie parser when login user the token is saved in the server and send to http client
app.use(cookieParser());
//Prevent attects
app.use(helmet({ 
    frameguard: false, // ملاحظة عربية
  crossOriginResourcePolicy: false })); // ملاحظة عربية

app.use(mongoSanitize()); // Sanitize data for privent NoSql injection attack
// Prevent XSS attacks. The assistant's chat message is exempt: it is sent to the
// model and stored as typed, and only ever rendered as text (routes/ai.routes.js).
app.use(skipFor(["/api/ai/chat"], xss()));

// Routes
app.use('/api/lesson', require('./Entities/Lesson/Lesson.route'));
app.use('/api/user', require('./Entities/User/User.route'));
app.use('/api/auth', require('./Entities/User/Auth.route'))
app.use('/api/attendance', require('./Entities/Attendance/Attendance.route'))
app.use('/api/student', require('./Entities/Student/Student.route'))
app.use('/api/sports', require('./Entities/Sport/Sport.route'));
app.use('/api/sport-portal', require('./Entities/SportPortal/SportPortal.route'));
app.use('/api/inviteToken', require('./Entities/InviteToken/InviteToken.route'))
app.use('/api/report', require('./Entities/Report/Report.route'));
app.use('/api/vehicle', require('./Entities/Vehicle/Vehicle.route'));
app.use('/api/notices', require('./Entities/Notice/Notice.route'));
app.use('/api/audit', require('./Entities/Audit/Audit.route'));
// Signed-in live channel (ticket + SSE); replaces the old open /api/events.
app.use('/api/live', require('./Entities/Live/Live.route'));
// Each signed-in user's own alert inbox (AiAlerts).
app.use('/api/alerts', require('./Entities/Alert/Alert.route'));
app.use('/api/tours', require('./routes/tours.routes'));
app.use('/api/storage', require('./Entities/Storage/Storage.route'))
app.use('/api/storage/google', require('./Entities/Storage/GoogleDrive.route'))
// Local Google-Drive-backed replacement for the remote Central Storage
// service that Storage.controller.js talks to (see CENTRAL_STORAGE_API_URL /
// CENTRAL_STORAGE_FILE_BASE_URL in config/.env). Restricts callers to
// loopback only (see the route file) since it's colocated on this public
// app rather than on an isolated host like the remote service it replaces.
app.use('/api/storage-backend', require('./Entities/Storage/CentralStorageBackend.route'))
// The assistant: signed in + ai.use on every route, 30 messages per user per hour.
app.use("/api/ai", aiRoutes);
// **********************************AUTO_PROCCESS ***************************
const { startDailyAbsenceJob } = require('./utils/daily');
startDailyAbsenceJob();
const { startVehicleExpiryJob, catchUpVehicleExpiryCheck } = require('./services/vehicleExpiryJob');
startVehicleExpiryJob();
// Periodic alerts: every 15 minutes, 07:00-21:00 Asia/Jerusalem.
const { startAlertJob } = require('./services/alertJob');
startAlertJob();
// **********************************END - AUTO_PROCCESS ***************************


//Dev logging middleware
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}
// Route middleware
app.get('/', (req, res) => {console.log("Server is up and running");res.send('Server is up and running'); });


// **********************************ALERTS POPUP***************************

const { errorPublisher } = require('./utils/errorPublisher');

// ملاحظة عربية
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Development-only route that throws, to see the error path end to end.
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/boom', (req, res, next) => {
    const err = new Error('سقوط تجريبي');
    err.status = 500;
    err.code = 'BOOM_EXAMPLE';
    next(err);
  });
}

// errorPublisher (logs server errors) must run before errorHandler: errorHandler sends the response
// and doesn't call next(err), so anything registered after it never sees the error.
app.use(errorPublisher);

//must be after routes call and after errorPublisher
//for catch 500-400 errors
app.use(errorHandler);

app.use(require("express").json({ limit: "50mb" }));
const StartServer = async () => {
  try {
    await connectDB();
    // **********************************END - ALERTS POPUP***************************
    const httpServer = http.createServer(app)
    const PORT = process.env.PORT || 5000;
    const NODE_ENV = process.env.NODE_ENV;
    await new Promise((resolve) => {
      httpServer.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`.blue.bold);
        resolve();
      });
    });
    // Runs after listen() so any self-referencing HTTP calls it makes
    // (e.g. storage folder provisioning) can actually reach this server.
    await ensureSystemAdmin();
    await require('./Entities/Notice/Notice.model').ensureNoticeIndexes()
      .catch((err) => console.error('Notice index:', err.message));
    await require('./Entities/Audit/Audit.model').ensureAuditIndexes()
      .catch((err) => console.error('Audit index:', err.message));
    await require('./Entities/Live/LiveTicket.model').ensureLiveTicketIndexes()
      .catch((err) => console.error('LiveTicket index:', err.message));
    await require('./Entities/Live/LiveEvent.model').ensureLiveEventIndexes()
      .catch((err) => console.error('LiveEvent index:', err.message));
    await require('./Entities/Alert/Alert.model').ensureAlertIndexes()
      .catch((err) => console.error('AiAlerts index:', err.message));
    await require('./Entities/Notice/Notice.model').ensureJobRunIndexes()
      .catch((err) => console.error('JobRuns index:', err.message));
    await require('./Entities/Attendance/Attendance.model').ensureAttendanceIndexes()
      .catch((err) => console.error('Attendances index:', err.message));
    await require('./Entities/AiConversation/AiConversation.model').ensureConversationIndexes()
      .catch((err) => console.error('AiConversations index:', err.message));
    await require('./Entities/AiUsage/AiRate.model').ensureAiRateIndexes()
      .catch((err) => console.error('AiRates index:', err.message));
    await require('./Entities/AiPendingAction/AiPendingAction.model').ensurePendingActionIndexes()
      .catch((err) => console.error('AiPendingActions index:', err.message));
    await require('./Entities/Sport/SportTeam.model').ensureSportTeamIndexes()
      .catch((err) => console.error('SportTeams index:', err.message));
    await require('./Entities/Sport/SportPlayer.model').ensureSportPlayerIndexes()
      .catch((err) => console.error('SportPlayers index:', err.message));
    await require('./Entities/Sport/SportTraining.model').ensureSportTrainingIndexes()
      .catch((err) => console.error('SportTrainings index:', err.message));
    await require('./Entities/Sport/SportLoginCode.model').ensureSportLoginCodeIndexes()
      .catch((err) => console.error('SportLoginCodes index:', err.message));
    await require('./Entities/Sport/SportAttendance.model').ensureSportAttendanceIndexes()
      .catch((err) => console.error('SportAttendance index:', err.message));
    await require('./Entities/Sport/SportLesson.model').ensureSportLessonIndexes()
      .catch((err) => console.error('SportLessons index:', err.message));
    catchUpVehicleExpiryCheck().catch((err) => console.error('Vehicle expiry catch-up:', err.message));

    // Ends the open live streams, drops every connection and exits; a hard
    // exit follows after 5 s even if closing hangs.
    const fatalShutdown = createFatalShutdown({
      server: httpServer,
      endStreams: () => require('./Entities/Live/Live.route').endAllStreams(),
    });

    // 1. Unhandled Promise Rejection (async errors)
    process.on('unhandledRejection', (err, promise) => {
      console.error('💥 Unhandled Rejection:', err?.message);
      console.error(err?.stack);
      fatalShutdown();
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
