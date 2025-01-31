// models/TransportPayment.js
import mongoose from 'mongoose';

const transportPaymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  billId: { type: String, required: true},
  method: { type: String, required: true }, // e.g., "credit card", "cash", etc.
  submittedBy: { type: String, required: true },
  date: { type: Date, default: Date.now },
  referenceId: { type: String, required: true },
  remark: { type: String },
});

const transportBillingSchema = new mongoose.Schema({
  billId: { type: String, required: true },
  invoiceNo: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
});

const transportPaymentAggregateSchema = new mongoose.Schema(
  {
    transportName: { type: String, required: true },
    transportType: { type: String, required: true }, // e.g., 'local', 'logistic'
    transportGst: { type: String},
    payments: [transportPaymentSchema], // Array of payments
    billings: [transportBillingSchema], // Array of billings
    totalAmountBilled: { type: Number, default: 0 }, // Total amount from billings
    totalAmountPaid: { type: Number, default: 0 }, // Total amount from payments
    paymentRemaining: { type: Number, default: 0 }, // Auto-calculated field
  },
  { timestamps: true }
);


// Method to add a payment and recalculate amounts
transportPaymentAggregateSchema.methods.addPayment = function (payment) {
  this.payments.push(payment);
  this.totalAmountPaid += payment.amount;
  this.paymentRemaining = this.totalAmountBilled - this.totalAmountPaid;
  return this.save();
};

// Method to add a billing and recalculate amounts
transportPaymentAggregateSchema.methods.addBilling = function (billing) {
  this.billings.push(billing);
  this.totalAmountBilled += billing.amount;
  this.paymentRemaining = this.totalAmountBilled - this.totalAmountPaid;
  return this.save();
};

// Pre-save middleware to auto-calculate total amounts and payment remaining
transportPaymentAggregateSchema.pre('save', function (next) {
  this.totalAmountPaid = this.payments.reduce((sum, payment) => sum + payment.amount, 0);
  this.totalAmountBilled = this.billings.reduce((sum, billing) => sum + billing.amount, 0);
  this.paymentRemaining = this.totalAmountBilled - this.totalAmountPaid;
  next();
});

const TransportPayment = mongoose.model('TransportPayment', transportPaymentAggregateSchema);
export default TransportPayment;
