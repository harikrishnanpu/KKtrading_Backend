// models/NeedToPurchase.js
import mongoose from 'mongoose';

const NeedToPurchaseSchema = new mongoose.Schema({
  item_id:        { type: String, required: true, trim: true },
  name:           { type: String, required: true, trim: true },
  salesmanName:   { type: String, default: '', trim: true },    // NEW
  remark:         { type: String, default: '', trim: true },    // NEW
  quantity:       { type: Number, required: true },
  quantityNeeded: { type: Number, default: 0 },
  purchased:      { type: Boolean, default: false },
  verified:       { type: Boolean, default: false },
  invoiceNo:      { type: String, default: '', trim: true },
  purchaseId:     { type: String, default: '', trim: true }
}, { timestamps: true });

export default mongoose.model('NeedToPurchase', NeedToPurchaseSchema);
