// models/ChatMessage.js
import mongoose from "mongoose";
const ChatMessageSchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    text: { type: String, default: '' },
    time: { type: String }, // Or store Date, up to you.

    // If you want to store the file URL (image/audio/video), you can do:
    fileUrl: { type: String }
  },
  { timestamps: true }
);

const ChatMessage = mongoose.model('ChatMessage', ChatMessageSchema);
export default ChatMessage;
