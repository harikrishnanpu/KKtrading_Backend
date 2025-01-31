import mongoose from 'mongoose';

const leaveApplicationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  reason: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, default: 'Pending' }, // 'Pending', 'Approved', 'Rejected'
}, { timestamps: true });

const LeaveApplication = mongoose.model('LeaveApplication', leaveApplicationSchema);

export default LeaveApplication;
