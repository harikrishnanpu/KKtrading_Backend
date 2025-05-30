import Notification from "../models/notificationModal.js";
import Users from '../models/userModel.js';

let io = null;

export function setSocketIO(ioInstance) {
  io = ioInstance;
}

export async function registerUser(userId, socketId) {
  try {
    await Users.updateOne(
      { _id: userId },
      { $set: { online_status: 'online' , socketId: socketId, lastCheckInTime: new Date() } }
    );

  } catch (err) {
    console.log("ERROR IN SOCKET:", err);
  }
}


export async function removeUserBySocket(socketId) {
  // console.log("errror in socket pending");
  let user = await Users.findOne({ socketId })
  if(user){
    user.online_status = 'offline';
    user.socketId = 'offline';
    await user.save();
  }
}

export async function emitFirstNotificationEvent(userId,socketId) {
  if (!io) {
    console.error("Socket.io not initialized.");
    return;
  }

  try {
    const notifications = await Notification.find({
      read: false,
      assignTo: { $in: [userId] }
    }).sort({ createdAt: -1 }).limit(5);

    const totalCount = await Notification.countDocuments({
      read: false,
      assignTo: { $in: [userId] }
    });

    io.to(socketId).emit("get-notification", { notifications, count: totalCount });
  } catch (err) {
    console.error("Error emitting notification:", err);
  }
}

export async function emitNotificationEvent(userIds) {
  if (!io) {
    console.error("Socket.io not initialized.");
    return;
  }

  // Ensure we handle both a single ID or an array
  const targets = Array.isArray(userIds) ? userIds : [userIds];

  for (const userId of targets) {

    try {
 
      let user = await Users.findById(userId);
      // fetch latest 5 unread + total count
      const [ notifications, totalCount ] = await Promise.all([
        Notification.find({ read: false, assignTo: userId })
                    .sort({ createdAt: -1 }).limit(5),
        Notification.countDocuments({ read: false, assignTo: userId })
      ]);
      if(user && user.socketId !== 'offline'){
        io.to(user.socketId).emit("notification", { notifications, count: totalCount });
      }
    } catch (err) {
      console.error(`Error emitting notification to ${userId}:`, err);
    }
  }
}