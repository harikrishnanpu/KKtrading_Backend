// models/Logmodal.js
import mongoose from 'mongoose';

const LogSchema = new mongoose.Schema({
  user: {
    type: String,
    required: false, // Allow it to be missing
    default: 'Guest', // Optional: set a default value for logs with no user
  },
  username: {
    type: String,
    required: true,
    default: 'Guest'
  },
  action: { type: String, required: true },
  details: { type: String },
  createdAt: { type: Date, default: Date.now },
  timestamp: { type: Date, default: Date.now },
},
{
  timestamps: true,
});

const Log = mongoose.model('Log', LogSchema);
export default Log;
