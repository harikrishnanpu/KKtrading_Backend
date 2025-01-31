// models/CustomerAccount.js
import mongoose from "mongoose";

// Sub-schema for individual bills
const billSchema = new mongoose.Schema({
  invoiceNo: {
    type: String,
    required: true,
    trim: true,
  },
  billAmount: {
    type: Number,
    required: true,
    min: [0, "Bill amount cannot be negative"],
  },
  invoiceDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  deliveryStatus: {
    type: String,
    default: "Pending",
  },
});

// Sub-schema for payments
const paymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: [0, "Payment amount cannot be negative"],
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  submittedBy: {
    type: String,
    required: true,
    trim: true,
  },
  referenceId: {
    type: String,
    required: true,
    trim: true,
  },
  remark: {
    type: String,
    trim: true,
  },
  // Linking Payment to Billing
  invoiceNo: {
    type: String,
    required: true,
    trim: true,
  },
  method: {type: String, required: true}
});

// Main CustomerAccount schema
const customerAccountSchema = new mongoose.Schema(
  {
    accountId: {
      type: String,
      unique: true,
      required: true,
      default: function () {
        // Generate a unique customer account ID (e.g., "CUS12345")
        return (
          "CUS" +
          Math.random().toString(36).substr(2, 9).toUpperCase()
        );
      },
    },
    customerId: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerAddress: {
      type: String,
      trim: true,
    },
    customerContactNumber: {
      type: String,
      required: true,
      trim: true,
    },
    customerAddress: {
      type: String,
      trim: true,
      required: true,
    },
    bills: [billSchema], // Array of bills
    payments: [paymentSchema], // Array of payments
    totalBillAmount: {
      type: Number,
      default: 0,
      min: [0, "Total bill amount cannot be negative"],
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, "Paid amount cannot be negative"],
    },
    pendingAmount: {
      type: Number,
      default: 0,
      min: [0, "Pending amount cannot be negative"],
    },
    // Add any other necessary fields here
  },
  { timestamps: true }
);

// Middleware to calculate totalBillAmount, paidAmount, and pendingAmount before saving
customerAccountSchema.pre("save", async function (next) {
  try {
    // === 1. Calculate Total Amounts ===
    this.totalBillAmount = this.bills.reduce(
      (acc, bill) => acc + (bill.billAmount || 0),
      0
    );
    this.paidAmount = this.payments.reduce(
      (acc, payment) => acc + (payment.amount || 0),
      0
    );
    this.pendingAmount = this.totalBillAmount - this.paidAmount;

    if (this.pendingAmount < 0) {
      return next(new Error("Paid amount exceeds total bill amount"));
    }

    // === 2. Check for Duplicate Invoice Numbers within the Customer ===
    if (this.isModified("bills")) {
      const invoiceNos = this.bills.map((bill) => bill.invoiceNo);
      const uniqueInvoiceNos = new Set();

      for (const invoiceNo of invoiceNos) {
        if (uniqueInvoiceNos.has(invoiceNo)) {
          return next(
            new Error(
              `Duplicate invoice number ${invoiceNo} in customer's bills`
            )
          );
        }
        uniqueInvoiceNos.add(invoiceNo);
      }
    }

    next();
  } catch (error) {
    next(new Error(`Error in pre-save middleware: ${error.message}`));
  }
});

const CustomerAccount = mongoose.model(
  "CustomerAccount",
  customerAccountSchema
);
export default CustomerAccount;
