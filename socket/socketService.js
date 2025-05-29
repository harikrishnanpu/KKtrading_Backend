import Notification from "../models/notificationModal.js";
import Users from '../models/userModel.js';

let io = null;
const userSocketMap = new Map(); // Moved here

export function setSocketIO(ioInstance) {
  io = ioInstance;
}

export async function registerUser(userId, socketId) {
  try {
    userSocketMap.set(userId, socketId);
    await Users.updateOne(
      { _id: userId },
      { $set: { online_status: 'online' } }
    );

  } catch (err) {
    console.log("ERROR IN SOCKET:", err);
  }
}


export async function removeUserBySocket(socketId) {
  try{
  for (let [userId, id] of userSocketMap.entries()) {
    if (id === socketId) {
      userSocketMap.delete(userId);

      await Users.updateOne(
      { _id: userId },
      { $set: { online_status: 'offline' } }
    );

      break;
    }
  }
}catch(err){
  console.log("errror in socket"+err);
}
}

export async function emitFirstNotificationEvent(userId) {
  if (!io) {
    console.error("Socket.io not initialized.");
    return;
  }

  const socketId = userSocketMap.get(userId);
  if (!socketId) {
    console.error("Socket ID not found for user:", userId);
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
    const socketId = userSocketMap.get(userId);
    if (!socketId) {
      console.log(`No active socket for user ${socketId}`);
      continue;
    }

    try {
      // fetch latest 5 unread + total count
      const [ notifications, totalCount ] = await Promise.all([
        Notification.find({ read: false, assignTo: userId })
                    .sort({ createdAt: -1 }).limit(5),
        Notification.countDocuments({ read: false, assignTo: userId })
      ]);

      io.to(socketId).emit("notification", { notifications, count: totalCount });
    } catch (err) {
      console.error(`Error emitting notification to ${userId}:`, err);
    }
  }
}