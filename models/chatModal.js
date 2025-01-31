import mongoose from 'mongoose';

// backend/models/ChatMessage.js

const chatMessageSchema = new mongoose.Schema({
  // If you need your own numeric ID
  id: { type: Number, required: true, unique: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, required: true },
  // Use a Date so we can store actual timestamps
  time: { type: Date, default: Date.now }
});

const Chat = mongoose.model('ChatMessage', chatMessageSchema);

export default Chat;