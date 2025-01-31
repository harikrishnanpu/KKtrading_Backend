import mongoose from "mongoose";



const  stockOpeningSchema = new mongoose.Schema({
    item_id: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    submittedBy: { type: String, required: true},
    remark: { type: String },
    date: { type: Date, default: Date.now() },
},{
    timestamps: true,
});


const StockOpening = mongoose.model('StockOpening', stockOpeningSchema);
export default StockOpening;