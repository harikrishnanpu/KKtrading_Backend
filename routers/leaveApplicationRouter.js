import express from 'express';
import asyncHandler from 'express-async-handler';
import LeaveApplication from '../models/leaveApplicationModal.js';


const leaveApplicationRouter = express.Router();

// POST /api/leaves - Submit a new leave application
leaveApplicationRouter.post('/', asyncHandler(async (req, res) => {
  const { userId, userName, reason, startDate, endDate } = req.body;
  if (!userId || !reason || !startDate || !endDate || !userName) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }
  
  const leave = new LeaveApplication({
    userId,
    userName,
    reason,
    startDate: new Date(startDate),
    endDate: new Date(endDate)
  });

  const created = await leave.save();
  res.json(created);
}));

// GET /api/leaves - Get all leaves
leaveApplicationRouter.get('/', asyncHandler(async (req, res) => {
  const leaves = await LeaveApplication.find().lean();
  res.json(leaves);
}));

// PUT /api/leaves/:id/approve - Approve a leave
leaveApplicationRouter.put('/:id/approve', asyncHandler(async (req, res) => {
  const leave = await LeaveApplication.findById(req.params.id);
  if (!leave) {
    return res.status(404).json({ message: 'Leave not found.' });
  }
  leave.status = 'Approved';
  await leave.save();
  res.json(leave);
}));

// PUT /api/leaves/:id/reject - Reject a leave
leaveApplicationRouter.put('/:id/reject', asyncHandler(async (req, res) => {
  const leave = await LeaveApplication.findById(req.params.id);
  if (!leave) {
    return res.status(404).json({ message: 'Leave not found.' });
  }
  leave.status = 'Rejected';
  await leave.save();
  res.json(leave);
}));

// DELETE /api/leaves/:id - Delete a leave application
leaveApplicationRouter.delete('/:id', asyncHandler(async (req, res) => {
  const leave = await LeaveApplication.findById(req.params.id);
  if (!leave) {
    return res.status(404).json({ message: 'Leave not found.' });
  }
  await leave.deleteOne();
  res.json({ message: 'Leave application deleted successfully.' });
}));

// PUT /api/leaves/:id - Edit leave application (optional)
leaveApplicationRouter.put('/:id', asyncHandler(async (req, res) => {
  const { reason, startDate, endDate } = req.body;
  const leave = await LeaveApplication.findById(req.params.id);
  if (!leave) {
    return res.status(404).json({ message: 'Leave not found.' });
  }
  if (reason) leave.reason = reason;
  if (startDate) leave.startDate = new Date(startDate);
  if (endDate) leave.endDate = new Date(endDate);

  await leave.save();
  res.json(leave);
}));

export default leaveApplicationRouter;
