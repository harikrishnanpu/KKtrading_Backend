// models/Transportation.js
import mongoose from 'mongoose';

const transportationSchema = new mongoose.Schema(
  {
    purchaseId: { type: String},
    invoiceNo: { type: String, required: true },
    transportCompanyName: { type: String, required: true },
    transportationCharges: { type: Number, required: true },
    billId: { type: String, required: true },
    companyGst: { type: String },
    transportType: { type: String, required: true },
    remarks: { type: String },
    otherDetails: { type: String },
  },
  { timestamps: true }
);

const Transportation = mongoose.model('Transportation', transportationSchema);
export default Transportation;
