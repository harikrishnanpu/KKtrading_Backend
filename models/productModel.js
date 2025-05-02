import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    name:    { type: String },
    comment: { type: String },
    rating:  { type: Number },
  },
  { timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, unique: true },
    item_id:      { type: String, required: true, unique: true },
    seller:       { type: String },
    image:        { type: String },
    brand:        { type: String },
    category:     { type: String },
    description:  { type: String },
    pUnit:        { type: String },
    sUnit:        { type: String },
    psRatio:      { type: String },
    length:       { type: String },
    breadth:      { type: String },
    actLength:    { type: String },
    actBreadth:   { type: String },
    size:         { type: String },
    unit:         { type: String },
    price:        { type: String },
    hsnCode:      { type: String },
    billPartPrice:{ type: Number },
    cashPartPrice:{ type: Number },
    sellerAddress:{ type: String },
    type:         { type: String },
    countInStock: { type: Number, required: true, min: 0 },
    rating:       { type: Number },
    numReviews:   { type: Number },
    gstPercent:   { type: Number },
    reviews:      [reviewSchema],
  },
  { timestamps: true }
);

const Product = mongoose.model('Product', productSchema);
export default Product;
