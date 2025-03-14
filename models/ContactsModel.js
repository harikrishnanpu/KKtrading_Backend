// models/Contact.js

import mongoose from "mongoose";
const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    address: { type: String },
    
    // If you have user accounts, you can store user _id or just a string
    submittedBy: { type: String }, 
    
    // Store location as GeoJSON (Point) so we can do geospatial queries if needed
    location: {
      type: {
        type: String,
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0], // [longitude, latitude]
      },
    },

    // Array of Bill Nos
    bills: [{ type: String }],
  },
  { timestamps: true }
);

const Contact = mongoose.model('Contact', contactSchema);
export default Contact;
