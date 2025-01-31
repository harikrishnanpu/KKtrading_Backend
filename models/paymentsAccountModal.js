// models/PaymentAccount.js
import mongoose from "mongoose";

// Sub-schema for payments
const paymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  method: {
    type: String,
    required: true,
  },
  remark: {
    type: String,
  },
  referenceId: {
    type: String,
    required: true,
  },
  submittedBy: {
    type: String,
    required: true,
    trim: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

// Main PaymentAccount schema
const paymentAccountSchema = new mongoose.Schema(
  {
    accountId: {
      type: String,
      unique: true,
      required: true,
      default: function () {
        // Generate a unique accountId (e.g., "ACC12345")
        return 'ACC' + Math.random().toString(36).substr(2, 9).toUpperCase();
      },
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
    },
    paymentsIn: [paymentSchema],
    paymentsOut: [paymentSchema],
    balanceAmount: {
      type: Number,
      default: 0,
    },
    // Add any other necessary fields here
  },
  { timestamps: true }
);

// Middleware to calculate balanceAmount before saving
paymentAccountSchema.pre("save", function (next) {
  const totalIn = this.paymentsIn.reduce(
    (acc, payment) => acc + payment.amount,
    0
  );
  const totalOut = this.paymentsOut.reduce(
    (acc, payment) => acc + payment.amount,
    0
  );
  this.balanceAmount = totalIn - totalOut;
  next();
});

const PaymentsAccount = mongoose.model(
  "PaymentsAccount",
  paymentAccountSchema
);
export default PaymentsAccount;
