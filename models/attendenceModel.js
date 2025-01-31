import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  loginTime: { type: Date, default: Date.now },
  logoutTime: { type: Date, default: null },
  date: { type: Date, default: Date.now },
},{  timestamps: true });

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance
