import http from 'http';
import { Server } from 'socket.io';
import express from 'express';
import mongoose from 'mongoose';
import dotenv, { parse } from 'dotenv';
import path from 'path';
import productRouter from './routers/productRouter.js';
import userRouter from './routers/userRouter.js';
import orderRouter from './routers/orderRouter.js';
import uploadRouter from './routers/uploadRouter.js';
import billingRouter from './routers/billingRouter.js';
import cors from 'cors';
import Location from './models/locationModel.js';
import returnRouter from './routers/returnRouter.js';
import xlsx from 'xlsx'; // Use 'xlsx' import for ES modules
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


dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(logMiddleware);
app.use(bodyParser.json({ limit: '10mb' }));



mongoose.connect('mongodb+srv://tradeinkk:1234@kktdb.zujhi.mongodb.net/?retryWrites=true&w=majority&appName=KKTDB');
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

app.use((err, req, res, next) => {
  res.status(500).send({ message: err.message });
});


app.get('/export', async (req, res) => {
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();

      // Create a new workbook
      const workbook = xlsx.utils.book_new();

      for (const collection of collections) {
          const collectionName = collection.name;

          // Fetch all data from the current collection
          const data = await mongoose.connection.db.collection(collectionName).find({}).toArray();

          // Convert data to a worksheet
          const worksheet = xlsx.utils.json_to_sheet(data);

          // Append the worksheet to the workbook with the collection name as the sheet name
          xlsx.utils.book_append_sheet(workbook, worksheet, collectionName);
      }

      // Write to a buffer instead of a file
      const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });

      // Set response headers to prompt file download
      res.setHeader('Content-Disposition', 'attachment; filename=all_data.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      // Send the buffer as the response
      res.send(buffer);
  } catch (error) {
      console.error('Error exporting data:', error);
      res.status(500).send('Internal Server Error');
  }
});


const port = process.env.PORT || 4000;

const httpServer = http.Server(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const users = [];



io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Listen for "sendMessage" from client
  socket.on('sendMessage', async (message) => {
    console.log('Message received from client:', message);
    
    // Optionally store to DB or broadcast
    // For example, we can emit to everyone:
    io.emit('receiveMessage', message);
  });

  // Optional: Listen for custom events or handle disconnection
  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});


// io.on('connection', (socket) => {

//   socket.on('disconnect', () => {
//     const user = users.find((x) => x.socketId === socket.id);
//     if (user) {
//       user.online = false;
//       console.log('Offline', user.name);
//       const admin = users.find((x) => x.isAdmin && x.online);
//       if (admin) {
//         io.to(admin.socketId).emit('updateUser', user);
//       }
//     }
//   });

//   socket.on('onLogin', (user) => {
//     const updatedUser = {
//       ...user,
//       online: true,
//       socketId: socket.id,
//       messages: [],
//     };
//     const existUser = users.find((x) => x._id === updatedUser._id);
//     if (existUser) {
//       existUser.socketId = socket.id;
//       existUser.online = true;
//     } else {
//       users.push(updatedUser);
//     }
//     console.log('Online', user.name);
//     const admin = users.find((x) => x.isAdmin && x.online);
//     if (admin) {
//       io.to(admin.socketId).emit('updateUser', updatedUser);
//     }
//     if (updatedUser.isAdmin) {
//       io.to(updatedUser.socketId).emit('listUsers', users);
//     }
//   });

//   socket.on('onUserSelected', (user) => {
//     const admin = users.find((x) => x.isAdmin && x.online);
//     if (admin) {
//       const existUser = users.find((x) => x._id === user._id);
//       io.to(admin.socketId).emit('selectUser', existUser);
//     }
//   });

//   socket.on('typing', (data) => {
//     socket.broadcast.emit('typing', data); // Notify other users
//   });

//   socket.on('stopTyping', (data) => {
//     socket.broadcast.emit('stopTyping', data); // Notify other users to stop typing
//   });

//   socket.on('onMessage', (message) => {
//     if (message.isAdmin) {
//       const user = users.find((x) => x._id === message._id && x.online);
//       if (user) {
//         io.to(user.socketId).emit('message', message);
//         user.messages.push(message);
//       }
//     } else {
//       const admin = users.find((x) => x.isAdmin && x.online);
//       if (admin) {
//         io.to(admin.socketId).emit('message', message);
//         const user = users.find((x) => x._id === message._id && x.online);
//         user.messages.push(message);
//       } else {
//         io.to(socket.id).emit('message', {
//           name: 'Admin',
//           body: 'Sorry. I am not online right now',
//         });
//       }
//     }
//   });


// // Listen for location updates from the client
// socket.on('update-location', async (data) => {
//   try {
//     const { userId, longitude, latitude, userName } = data;

//     // Basic validation
//     if (typeof longitude !== 'number' || typeof latitude !== 'number') {
//       throw new Error('Invalid coordinates');
//     }

//     // Update the location or create it if it doesn't exist
//     const updatedLocation = await Location.findOneAndUpdate(
//       { userId }, // Search by userId
//       { name: userName, coordinates: [longitude, latitude] }, // Update name and coordinates
//       { upsert: true, new: true } // If not found, create it (upsert)
//     );

//     // Broadcast the location update to all connected clients
//     io.emit('location-updated', { userId, longitude, latitude, userName });

//     // Optionally: console.log(`Location updated for user ${userId}: [${longitude}, ${latitude}]`);

//   } catch (error) {
//     console.error('Error updating location:', error);
//   }
// });





// });

httpServer.listen(port,'0.0.0.0', () => {
  console.log(`Serve at http://localhost:${port}`);
});

// app.listen(port, () => {
//   console.log(`Serve at http://localhost:${port}`);
// });
