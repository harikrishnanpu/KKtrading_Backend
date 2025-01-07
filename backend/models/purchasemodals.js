// models/purchaseModel.js
import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    name: { type: String, required: true },
    brand: { type: String },
    category: { type: String },
    quantity: { type: Number, required: true },
    quantityInNumbers: { type: Number, required: true },
    sUnit: { type: String },
    psRatio: { type: Number },
    length: { type: Number },
    breadth: { type: Number },
    actLength: {type: Number},
    actBreadth: {type: Number},
    size: { type: String },
    pUnit: { type: String },
    cashPartPrice: { type: Number, required: true },
    billPartPrice: { type: Number, required: true },
    cashPartPriceInNumbers: { type: Number, required: true },
    billPartPriceInNumbers: { type: Number, required: true },
    allocatedOtherExpense: { type: Number, default: 0 },
    totalPriceInNumbers: { type: Number, default: 0 },
    gstPercent: { type: Number, required: true },
  },
  { _id: false }
);

const totalsSchema = new mongoose.Schema(
  {
    billPartTotal: { type: Number, required: true },
    cashPartTotal: { type: Number, required: true },
    amountWithoutGSTItems: { type: Number, required: true },
    gstAmountItems: { type: Number, required: true },
    cgstItems: { type: Number, required: true },
    sgstItems: { type: Number, required: true },
    amountWithoutGSTTransport: { type: Number, default: 0 },
    gstAmountTransport: { type: Number, default: 0 },
    cgstTransport: { type: Number, default: 0 },
    sgstTransport: { type: Number, default: 0 },
    unloadingCharge: { type: Number, default: 0 },
    insurance: { type: Number, default: 0 },
    damagePrice: { type: Number, default: 0 },
    totalPurchaseAmount: { type: Number, required: true },
    totalOtherExpenses: { type: Number, default: 0 },
    grandTotalPurchaseAmount: { type: Number, required: true },
    transportationCharges: { type: Number, default: 0 },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    sellerName: { type: String, required: true },
    sellerId: { type: String, required: true },
    invoiceNo: { type: String, required: true },
    items: [itemSchema],
    purchaseId: { type: String, unique: true, required: true },
    sellerAddress: { type: String },
    sellerGst: { type: String },
    billingDate: { type: Date, required: true },
    invoiceDate: { type: Date, required: true },
    totals: totalsSchema,
    transportationDetails: { type: Object }, // Include transportationDetails
  },
  { timestamps: true }
);

const Purchase = mongoose.model('Purchase', purchaseSchema);
export default Purchase;
