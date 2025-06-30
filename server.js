// /server/server.js  (ES-module syntax)

import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xssClean from 'xss-clean';
import hpp from 'hpp';
import path from 'path';
import fs from 'fs';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server as SocketIO } from 'socket.io';

/* ------------- load env vars ------------- */
dotenv.config();
const {
  NODE_ENV,
  PORT = 4000,
  FRONTEND_URL = 'https://office.vrkkt.com',
  MONGODB_URI,
} = process.env;

/* ------------- DB connection ------------- */
mongoose
  .connect(MONGODB_URI, { autoIndex: NODE_ENV === 'development' })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

/* ------------- app + middleware ------------- */
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isTrusted =
  req.hostname === 'localhost' ||
  req.hostname === '127.0.0.1' ||
  req.hostname === '192.168.1.50'

/* ---------- security headers (Helmet) ---------- */

if(isTrusted){
    app.use(helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    originAgentCluster: true,
    // your CSP here
  }));
}else {
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // REMOVE or conditionally apply
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", FRONTEND_URL, 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'],
        styleSrc: ["'self'", FRONTEND_URL, 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', FRONTEND_URL],
        connectSrc: ["'self'", FRONTEND_URL, 'wss://office.vrkkt.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      }
    }
  })
);
}

/* ---------- CORS ---------- */

const allowedOrigins = ['http://localhost:3000', 'http://localhost:4000', 'http://192.168.1.50:4000' , FRONTEND_URL];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS – origin not allowed'));
    },
    credentials: true,
  })
);

/* ---------- body parsers ---------- */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ---------- payload sanitizers ---------- */
app.use(mongoSanitize()); // prevent NoSQL injection
app.use(xssClean());      // prevent XSS
app.use(hpp());           // prevent HTTP param pollution

/* ---------- rate limiter ---------- */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

/* ---------- request logging ---------- */
if (NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: fs.createWriteStream(
        path.join(__dirname, 'logs', `access-${new Date().toISOString().slice(0, 10)}.log`),
        { flags: 'a' }
      ),
    })
  );
  app.use(morgan('dev')); // console
}

/* ---------- custom middleware ---------- */
import logMiddleware, { useAdminAuth, useAuth } from './middleware.js';
app.use(logMiddleware);

/* ---------- routers ---------- */
import productRouter from './routers/productRouter.js';
import userRouter from './routers/userRouter.js';
import orderRouter from './routers/orderRouter.js';
import uploadRouter from './routers/uploadRouter.js';
import billingRouter from './routers/billingRouter.js';
import returnRouter from './routers/returnRouter.js';
import transactionRouter from './routers/dailyRouter.js';
import purchaseRouter from './routers/purchaseRouter.js';
import printRouter from './routers/printRouter.js';
import accountRouter from './routers/accountPaymentsRouter.js';
import sellerPaymentsRouter from './routers/sellerPaymentsRouter.js';
import transportPaymentsRouter from './routers/transportPaymentsRouter.js';
import siteReportRouter from './routers/siteReportRouter.js';
import customerRouter from './routers/customerRouter.js';
import supplierRouter from './routers/supplierRouter.js';
import stockUpdateRouter from './routers/stockUpdateRouter.js';
import leaveApplicationRouter from './routers/leaveApplicationRouter.js';
import dashboardRouter from './routers/dashboardRouter.js';
import announcementRouter from './routers/announcementRouter.js';
import taskRouter from './routers/taskBoardRouter.js';
import calendarRouter from './routers/calendarRouter.js';
import chatRouter from './routers/chatRouter.js';
import notificationRouter from './routers/notificationRouter.js';
import ContactRouter from './routers/contactsRouter.js';
import updateInfoRouter from './routers/updatesInfoRouter.js';
import purchaseRequestRouter from './routers/purchaseRequestRouter.js';
import needToPurchaseRouter from './routers/needToPurchaseRouter.js';

/* --- mount routers --- */
app.use('/api/uploads', useAuth, uploadRouter);
app.use('/api/users', userRouter);
app.use('/api/products', useAuth, productRouter);
app.use('/api/orders', useAuth, orderRouter);
app.use('/api/billing', useAuth, billingRouter);
app.use('/api/returns', useAuth, returnRouter);
app.use('/api/daily', useAdminAuth, transactionRouter);
app.use('/api/purchases', useAdminAuth , purchaseRouter);
app.use('/api/print' , useAdminAuth , printRouter);
app.use('/api/accounts', useAuth ,  accountRouter);
app.use('/api/sellerPayments', useAdminAuth , sellerPaymentsRouter);
app.use('/api/transportpayments', useAdminAuth , transportPaymentsRouter);
app.use('/api/site-report', useAdminAuth , siteReportRouter);
app.use('/api/customer', useAdminAuth , customerRouter);
app.use('/api/seller', useAdminAuth , supplierRouter);
app.use('/api/stock-update', useAuth , stockUpdateRouter);
app.use('/api/leaves', useAuth , leaveApplicationRouter);
app.use('/api/chart' , useAuth , dashboardRouter);
app.use('/api/announcements' , useAuth , announcementRouter);
app.use('/api/taskboard', useAuth , taskRouter);
app.use('/api/calendar',useAuth, calendarRouter);
app.use('/api/chat',useAuth, chatRouter);
app.use('/api/notifications', useAuth, notificationRouter);
app.use('/api/contacts', useAuth, ContactRouter);
app.use('/api/updates', useAuth , updateInfoRouter);
app.use('/api/purchase-requests', useAuth,  purchaseRequestRouter);
app.use('/api/needtopurchase', useAuth, needToPurchaseRouter);

/* ---------- static files ---------- */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const buildPath = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(buildPath));

/* ⚠️  SPA catch-all (safe alt to app.use('*')) */
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

/* ---------- basic health route ---------- */
app.get('/status', (_, res) => res.json({ ok: true, timestamp: Date.now() }));

/* ---------- HTTP + Socket.IO ---------- */
const httpServer = http.createServer(app);

const io = new SocketIO(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

import { registerUser, emitFirstNotificationEvent, removeUserBySocket, setSocketIO } from './socket/socketService.js';
setSocketIO(io);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('register-user', async (userId) => {
    await registerUser(userId, socket.id);
    await emitFirstNotificationEvent(userId, socket.id);
  });

  socket.on('disconnect', () => removeUserBySocket(socket.id));
});

/* ---------- central error handler ---------- */
app.use((err, req, res, next) => {
  const logLine = `[${new Date().toISOString()}] ${req.method} ${
    req.originalUrl
  } - ${err.stack || err.message}\n`;

  const logDir = path.join(__dirname, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(
    path.join(logDir, `error-${new Date().toISOString().slice(0, 10)}.log`),
    logLine
  );

  res.status(err.status || 500).json({
    message: 'Error From Server: report the issue !',
    error: NODE_ENV === 'development' ? err.message : undefined,
  });

});

/* ---------- start server ---------- */
httpServer.listen(PORT, '0.0.0.0', () =>
  console.log(`API server running successfully ➜`)
);
