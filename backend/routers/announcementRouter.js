// routes/announcementRouter.js

import express from 'express';
import Annouuncements from '../models/AnnouncementModal.js'; 
// ^ Make sure this path is correct relative to your file structure.
//   If your model file is indeed named "announcement.model.js", then adjust accordingly.

const announcementRouter = express.Router();

// ===============================
// GET ALL Announcements
// ===============================
announcementRouter.get('/', async (req, res) => {
  try {
    const announcements = await Annouuncements.find().sort({ createdAt: -1 });
    return res.json(announcements);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to fetch announcements' });
  }
});

// ===============================
// CREATE Announcement
// ===============================
announcementRouter.post('/', async (req, res) => {
  try {
    // Expecting: title, message, time, status, submitted, attachments, buttons
    const { title, message, time, status, submitted, attachments, buttons } = req.body;

    const newAnnouncement = new Annouuncements({
      title,
      message,
      time,
      status,
      submitted,
      attachments,
      buttons
    });

    const savedAnnouncement = await newAnnouncement.save();
    return res.status(201).json(savedAnnouncement);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to create announcement' });
  }
});

// ===============================
// UPDATE Announcement
// ===============================
announcementRouter.put('/:id', async (req, res) => {
  try {
    // Expecting: title, message, time, status, attachments, buttons
    const { title, message, time, status, attachments, buttons } = req.body;

    const updated = await Annouuncements.findByIdAndUpdate(
      req.params.id,
      {
        title,
        message,
        time,
        status,
        attachments,
        buttons
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    return res.json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to update announcement' });
  }
});

// ===============================
// DELETE Announcement
// ===============================
announcementRouter.delete('/:id', async (req, res) => {
  try {
    const deleted = await Annouuncements.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Announcement not found' });
    }
    return res.json({ message: 'Announcement deleted', _id: deleted._id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to delete announcement' });
  }
});

export default announcementRouter;
