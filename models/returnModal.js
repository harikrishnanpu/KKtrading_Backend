import mongoose from 'mongoose';

// Define a sub-schema for Other Expenses
const otherExpensesSchema = mongoose.Schema(
  {
    amount: { type: Number},
    remark: { type: String},
  },
  { _id: false } // we can disable _id for sub-docs if desired
);

// Define a sub-schema for products
const productSchema = mongoose.Schema(
  {
    item_id: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    // You can add more fields such as returnPrice if you want to store them
  },
  { _id: false }
);

const returnSchema = mongoose.Schema(
  {
    // Common Fields
    returnNo: { type: String, required: true, unique: true },
    returnType: { type: String, required: true }, // 'bill' or 'purchase'
    returnDate: { type: Date, required: true },

    // For Bill Returns
    billingNo: { type: String }, // required if returnType = 'bill'
    customerName: { type: String },
    customerAddress: { type: String },

    // For Purchase Returns
    purchaseNo: { type: String }, // required if returnType = 'purchase'
    sellerName: { type: String },
    sellerAddress: { type: String },

    // Products (common to both)
    products: [productSchema],

    // Financial Fields
    discount: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    totalTax: { type: Number, required: true },
    returnAmount: { type: Number, required: true },
    netReturnAmount: { type: Number, required: true },

    // New field for array of other expenses
    otherExpenses: [otherExpensesSchema],
  },
  { timestamps: true }
);

const Return = mongoose.model('Return', returnSchema);

export default Return;
