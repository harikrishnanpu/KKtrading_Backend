// models/QrCodeDB.js
import mongoose from 'mongoose';

const qrcodeSchema = mongoose.Schema(
  {
    qrcodeId: { type: String, required: true },
    billId: { type: String, required: true },
    Date: { type: String, default: Date.now() },
  },
  {
    timestamps: true,
  }
);

const QrCodeDB = mongoose.model('QrCode', qrcodeSchema);

export default QrCodeDB;
