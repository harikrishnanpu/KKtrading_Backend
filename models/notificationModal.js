import mongoose from "mongoose";


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
    assignTo: {
      type: [String], // array of user IDs, names, or other identifiers
      default: []
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  });

const Notification = mongoose.model('Notification', NotificationSchema);
export default Notification;
