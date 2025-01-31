// models/sellerPaymentModel.js
import mongoose from 'mongoose';

const billingSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  invoiceNo: { type: String, required: true },
});

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  method: { type: String, required: true }, // accountId from PaymentsAccount
  submittedBy: { type: String, required: true },
  referenceId: { type: String},
  remark: { type: String },
});

const sellerPaymentSchema = new mongoose.Schema(
  {
    sellerId: { type: String, required: true },
    sellerName: { type: String, required: true },
    billings: [billingSchema], // Array of bills
    payments: [paymentSchema], // Array of payments
    totalAmountBilled: { type: Number, default: 0 },
    totalAmountPaid: { type: Number, default: 0 },
    paymentRemaining: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Middleware to calculate totals before saving
sellerPaymentSchema.pre('save', function (next) {
  this.totalAmountBilled = this.billings.reduce((sum, billing) => sum + billing.amount, 0);
  this.totalAmountPaid = this.payments.reduce((sum, payment) => sum + payment.amount, 0);
  this.paymentRemaining = this.totalAmountBilled - this.totalAmountPaid;
  next();
});

const SellerPayment = mongoose.model('SellerPayment', sellerPaymentSchema);
export default SellerPayment;
