// models/NeedToPurchase.js
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    item_id: { type: String, required: true },
    name:    { type: String, required: true },
    quantity: { type: Number, required: true },
    requestedBy: String,
    purchased:  { type: Boolean, default: false },
    verified:   { type: Boolean, default: false },
    invoiceNo: { type: String },
    quantityNeeded:  { type: Number, default: 0 },     
    purchaseId:      { type: String },  
  },
  { timestamps: true }
);


const NeedToPurchase =  mongoose.model("NeedToPurchase", schema);
export default NeedToPurchase;
