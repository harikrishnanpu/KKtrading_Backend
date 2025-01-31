// routes/calendar.js
import express from 'express';
import Event from '../models/calendarModal.js';


const calendarRouter = express.Router();

// ----------------------------------------------------------------------
// GET all events
// Endpoint: GET /api/calendar/events
// ----------------------------------------------------------------------
calendarRouter.get('/events', async (req, res) => {
  try {
    const events = await Event.find().lean();
    // Transform `_id` to `id` if you prefer
    const response = events.map((doc) => ({
      ...doc,
      id: doc._id.toString() // rename _id field
    }));

    return res.status(200).json({ events: response });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// ADD a new event
// Endpoint: POST /api/calendar/events/add
// ----------------------------------------------------------------------
calendarRouter.post('/events/add', async (req, res) => {
  try {
    const newEvent = new Event(req.body);
    const savedEvent = await newEvent.save();

    // If you want to rename `_id` to `id`, do so here:
    const { _id, ...rest } = savedEvent.toObject();
    return res.status(201).json({
      message: 'Event created successfully',
      newEvent: { ...rest, id: _id.toString() }
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// UPDATE an event
// Endpoint: POST /api/calendar/events/update
// ----------------------------------------------------------------------
calendarRouter.post('/events/update', async (req, res) => {
  try {
    const { id, ...rest } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Event ID is required' });
    }

    const updatedEvent = await Event.findByIdAndUpdate(id, rest, {
      new: true // return the updated doc
    });

    if (!updatedEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const { _id, ...doc } = updatedEvent.toObject();
    return res.status(200).json({
      message: 'Event updated successfully',
      updatedEvent: { ...doc, id: _id.toString() }
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// DELETE an event
// Endpoint: POST /api/calendar/events/delete
// ----------------------------------------------------------------------
calendarRouter.post('/events/delete', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Event ID is required' });
    }

    const deletedEvent = await Event.findByIdAndDelete(id);
    if (!deletedEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }

    return res.status(200).json({ message: 'Event deleted successfully' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

export default calendarRouter;
