import mongoose from "mongoose";

const stockRegistrySchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    updatedBy: {type: String, default: 'unknown'},
    itemId: { type: String, required: true },
    name: { type: String, required: true },
    brand: { type: String },
    category: { type: String },
    changeType: {
      type: String,
      required: true,
    },
    invoiceNo: { type: String, default: null },
    quantityChange: { type: Number, required: true },
    finalStock: { type: Number, required: true },
  },
  { timestamps: true }
);

const StockRegistry = mongoose.model('StockRegistry', stockRegistrySchema);
export default StockRegistry;