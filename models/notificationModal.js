import mongoose from "mongoose";
import { emitNotificationEvent } from "../socket/socketService.js";


const NotificationSchema = new mongoose.Schema({
    title: {
      type: String,
      required: true
    },
    message: {
      type: String
    },
    type: {
      type: String,
      default: '' // 'gift', 'message', 'setting', or any custom type
    },
    extraInfo: {
      type: String
    },
    read: {
      type: Boolean,
      default: false
    },
    assignedBy: {
      type: String,
      required: true
    },
    assignTo: {
      type: [String], // array of user IDs, names, or other identifiers
      default: []
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  });

  NotificationSchema.post('save', async function (doc) {
    await emitNotificationEvent(doc.assignTo)
  });

const Notification = mongoose.model('Notification', NotificationSchema);





export default Notification;
