import mongoose from "mongoose";

const damagedItemSchema = new mongoose.Schema({
  item_id: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number},
  quantity: { type: Number, required: true },
});

const damageSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  remark: { type: String },
  date: { type: Date, default: Date.now() },
  damagedItems: [damagedItemSchema],
}, { timestamps: true });

const Damage = mongoose.model('Damage', damageSchema);

export default Damage