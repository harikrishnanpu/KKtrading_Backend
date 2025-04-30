import mongoose from 'mongoose';

/* — single item — */
const requestItemSchema = new mongoose.Schema(
  {
    itemId:          { type: String },                // optional
    name:            { type: String, required: true },
    brand:           { type: String },
    category:        { type: String },
    quantity:        { type: Number, required: true },
    quantityInUnits: { type: Number, required: true },
    pUnit:           { type: String, required: true },
    sUnit:           { type: String, required: true },
    psRatio:         { type: Number },
    length:          { type: Number },
    breadth:         { type: Number },
    actLength:       { type: Number },
    actBreadth:      { type: Number },
    size:            { type: String },
  },
  { _id: false }
);

/* — whole request — */
const purchaseRequestSchema = new mongoose.Schema(
  {
    requestFrom: {
      name:    { type: String, required: true },
      address: { type: String, required: true },
    },
    requestTo: {
      name:    { type: String, required: true },
      address: { type: String, required: true },
    },
    requestDate: { type: Date, default: Date.now },
    items:       [requestItemSchema],

    /* workflow */
    status: {
      type: String,
      enum: ['pending', 'received', 'not-submitted'],
      default: 'pending',
    },

    /* when received, link to a real purchase */
    linkedPurchaseId: { type: String },

    submittedBy: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model('PurchaseRequest', purchaseRequestSchema);
