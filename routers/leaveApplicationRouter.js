import express from 'express';
import asyncHandler from 'express-async-handler';
import LeaveApplication from '../models/leaveApplicationModal.js';
import Event from '../models/calendarModal.js';


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


      const eventTitle = `Approved Leave: ${leave.userName} (From: ${leave.startDate.toISOString().split('T')[0]} To: ${leave.endDate.toISOString().split('T')[0]})`;
  
      // Check if an event already exists for this leave
      let event = await Event.findOne({ title: eventTitle });
  
      if (event) {
        // Update the existing event
        event.start = leave.startDate;
        event.end = leave.endDate;
        event.color = "#ff9800"; // Orange color for approved leave
        event.textColor = "#ffffff"; // White text
        await event.save();
      } else {
        // Create a new event
        event = new Event({
          title: eventTitle,
          start: leave.startDate,
          end: leave.endDate,
          color: "#ff9800", // Orange color for approved leave
          textColor: "#ffffff", // White text
          allDay: false // Allows specific start & end times
        });
        await event.save();
      }
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

  // Generate event title with date range to ensure uniqueness
  const eventTitle = `Approved Leave: ${leave.userName} (From: ${leave.startDate.toISOString().split('T')[0]} To: ${leave.endDate.toISOString().split('T')[0]})`;

  // Delete corresponding event from the calendar
  await Event.findOneAndDelete({ title: eventTitle });

  // Delete the leave application
  await leave.deleteOne();

  res.json({ message: 'Leave application and related calendar event deleted successfully.' });
}));

// PUT /api/leaves/:id - Edit leave application
leaveApplicationRouter.put('/:id', asyncHandler(async (req, res) => {
  const { reason, startDate, endDate, approved } = req.body;
  const leave = await LeaveApplication.findById(req.params.id);

  if (!leave) {
    return res.status(404).json({ message: 'Leave not found.' });
  }

  // Update leave fields
  if (reason) leave.reason = reason;
  if (startDate) leave.startDate = new Date(startDate);
  if (endDate) leave.endDate = new Date(endDate);
  if (approved !== undefined) leave.approved = approved;

  await leave.save();

  // ✅ If leave is approved, add/update it in the calendar (Event model)
  if (approved) {
    const eventTitle = `Approved Leave: ${leave.userName} (From: ${leave.startDate.toISOString().split('T')[0]} To: ${leave.endDate.toISOString().split('T')[0]})`;

    // Check if an event already exists for this leave
    let event = await Event.findOne({ title: eventTitle });

    if (event) {
      // Update the existing event
      event.start = leave.startDate;
      event.end = leave.endDate;
      event.color = "#ff9800"; // Orange color for approved leave
      event.textColor = "#ffffff"; // White text
      await event.save();
    } else {
      // Create a new event
      event = new Event({
        title: eventTitle,
        start: leave.startDate,
        end: leave.endDate,
        color: "#ff9800", // Orange color for approved leave
        textColor: "#ffffff", // White text
        allDay: false // Allows specific start & end times
      });
      await event.save();
    }
  }

  res.json(leave);
}));

export default leaveApplicationRouter;
