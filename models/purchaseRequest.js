import mongoose from 'mongoose';

/** ➟ One line per item in the request */
const requestItemSchema = new mongoose.Schema(
  {
    itemId:          { type: String, required: true },
    name:            { type: String, required: true },
    brand:           { type: String },
    category:        { type: String },
    quantity:        { type: Number, required: true },
    quantityInUnits: { type: Number, required: true },    // ← NOS after BOX/SQFT math
    pUnit:           { type: String, required: true },    // SQFT | BOX | NOS | …
    sUnit:           { type: String, required: true },    // NOS | SQFT | …
    psRatio:         { type: Number },                    // P-unit ⇢ S-unit ratio
    length:          { type: Number },
    breadth:         { type: Number },
    actLength:       { type: Number },
    actBreadth:      { type: Number },
    size:            { type: String },
  },
  { _id: false }
);

/** ➟ Whole request */
const purchaseRequestSchema = new mongoose.Schema(
  {
    /** Who is requesting? */
    requestFrom: {
      name:    { type: String, required: true },
      address: { type: String, required: true },
    },

    /** Who will receive / approve the request? */
    requestTo: {
      name:    { type: String, required: true },
      address: { type: String, required: true },
    },

    requestDate: { type: Date, default: Date.now },

    /** Items wanted (NO price fields) */
    items: [requestItemSchema],

    /** Optional status for approval workflow */
    status: {
      type: String,
      enum: ['pending', 'received', 'not-submitted'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

const PurchaseRequest = mongoose.model('PurchaseRequest', purchaseRequestSchema);
export default PurchaseRequest;
