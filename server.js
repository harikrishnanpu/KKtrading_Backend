import http from 'http';
import { Server } from 'socket.io';
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import productRouter from './routers/productRouter.js';
import userRouter from './routers/userRouter.js';
import orderRouter from './routers/orderRouter.js';
import uploadRouter from './routers/uploadRouter.js';
import billingRouter from './routers/billingRouter.js';
import cors from 'cors';
import returnRouter from './routers/returnRouter.js';
import logMiddleware from './middleware.js';
import bodyParser from 'body-parser';
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
import fs from 'node:fs';
import { emitFirstNotificationEvent, registerUser, removeUserBySocket, setSocketIO } from './socket/socketService.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(logMiddleware);
app.use(bodyParser.json({ limit: '10mb' }));



mongoose.connect('mongodb://localhost:27017,localhost:27018,localhost:27019/kktdb?replicaSet=rs0&retryWrites=true&w=majority');
app.use('/api/uploads', uploadRouter);
app.use('/api/users', userRouter);
app.use('/api/products', productRouter);
app.use('/api/orders', orderRouter);
app.use('/api/billing', billingRouter); // Use the billing routes under the /api/billing path
app.use('/api/returns',returnRouter);
app.use('/api/daily',transactionRouter); 
app.use('/api/purchases',purchaseRouter);
app.use('/api/print',printRouter);
app.use('/api/accounts',accountRouter);
app.use('/api/sellerPayments',sellerPaymentsRouter);
app.use('/api/transportpayments', transportPaymentsRouter);
app.use('/api/site-report', siteReportRouter);
app.use('/api/customer', customerRouter);
app.use('/api/seller', supplierRouter);
app.use('/api/stock-update', stockUpdateRouter);
app.use('/api/leaves', leaveApplicationRouter);
app.use('/api/chart', dashboardRouter); 
app.use('/api/announcements', announcementRouter);
app.use('/api/taskboard', taskRouter)
app.use('/api/calendar', calendarRouter);
app.use('/api/chat', chatRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/contacts', ContactRouter);
app.use('/api/updates', updateInfoRouter);
app.use('/api/purchase-requests', purchaseRequestRouter);
app.use("/api/needtopurchase", needToPurchaseRouter);








app.get('/api/config/paypal', (req, res) => {
  res.send(process.env.PAYPAL_CLIENT_ID || 'sb');
});
app.get('/api/config/google', (req, res) => {
  res.send(process.env.GOOGLE_API_KEY || '');
});
const __dirname = path.resolve();
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));
app.use(express.static(path.join(__dirname, '/frontend/build')));
// app.get('*', (req, res) =>
//   res.sendFile(path.join(__dirname, '/frontend/build/index.html'))
// );


app.get('/', (req, res) => {
  res.send('Server is ready');
});


const port = process.env.PORT || 4000;

const httpServer = http.Server(app);
export const io = new Server(httpServer, { cors: { origin: '*' } });
setSocketIO(io); // pass socket instance globally



io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('register-user', async (userId) => {    
    await registerUser(userId, socket.id);
    await emitFirstNotificationEvent(userId,socket.id);
  });

  socket.on('disconnect', () => {
    removeUserBySocket(socket.id);
  });

});

app.use((err, req, res, next) => {

  // Prepare log message
  const errorLog = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${err.stack || err.message}\n`;

  // Ensure logs directory exists
  const logDir = path.join(__dirname, 'logs');

  // Append to error log file
  fs.appendFile(path.join(logDir, 'errorlogs.txt'), errorLog, (fsErr) => {
    if (fsErr) {
      console.error('Failed to write to log file:', fsErr);
    }
  });

  // Respond to the client
  res.status(500).json({
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});


httpServer.listen(port,'0.0.0.0', () => {
  console.log(`Serve at http://localhost:${port}`);
});





