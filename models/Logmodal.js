// models/Log.js
import mongoose from 'mongoose';

const logSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

const Log = mongoose.model('Log', logSchema);

export default Log;