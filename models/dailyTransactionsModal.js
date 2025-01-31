import mongoose from 'mongoose';

const DailyTransactionSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    type: { 
      type: String, 
      required: true, 
      enum: ['in', 'out', 'transfer'] // Allow 'transfer' as well
    },
    amount: { type: Number, required: true },
    paymentFrom: { type: String }, // For 'in' and 'transfer' transactions
    paymentTo: { type: String },   // For 'out' and 'transfer' transactions
    category: { type: String, required: true },
    method: { type: String, required: true }, // Payment method (accountId)
    remark: { type: String },
    billId: { type: String },      // Optional, if linked to a billing
    purchaseId: { type: String },  // Optional, if linked to a purchase
    transportId: { type: String }, // Optional, if linked to a transport payment
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Reference IDs to help identify the corresponding payment entries in accounts
    referenceId: { type: String },    // For 'in' or 'out' transactions
    referenceIdOut: { type: String }, // For 'transfer' (outgoing) transaction entry
    referenceIdIn: { type: String },  // For 'transfer' (incoming) transaction entry
  },
  { timestamps: true }
);

const TransactionCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
});

const DailyTransaction = mongoose.model('DailyTransaction', DailyTransactionSchema);
const TransactionCategory = mongoose.model('TransactionCategory', TransactionCategorySchema);

export { DailyTransaction, TransactionCategory };
