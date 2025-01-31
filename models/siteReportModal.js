// models/siteReportModel.js
import mongoose from 'mongoose';

const siteReportSchema = new mongoose.Schema(
  {
    siteName: { type: String, required: true },
    address: { type: String, required: true },
    customerName: { type: String, required: true },
    customerContactNumber: { type: String, required: true },
    contractorName: { type: String, required: true },
    contractorContactNumber: { type: String, required: true },
    siteDetails: { type: String, required: true },
    remarks: { type: String },
    submittedBy: { type: String, required: true },
    location: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    image: {type: String, required: true},
    visited: {type: Boolean, default: false},
  },
  {
    timestamps: true,
  }
);

const SiteReport = mongoose.model('SiteReport', siteReportSchema);

export default SiteReport;
