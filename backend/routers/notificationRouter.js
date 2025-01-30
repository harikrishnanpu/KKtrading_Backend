// routes/notificationRoutes.js

import express from 'express';
import Notification from '../models/notificationModal.js';

const notificationRouter = express.Router();

// GET all notifications// GET all notifications
notificationRouter.get('/', async (req, res) => {
    try {
      const notifications = await Notification.find().sort({ createdAt: -1 });
      return res.json(notifications);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  
  // GET single notification
  notificationRouter.get('/:id', async (req, res) => {
    try {
      const notification = await Notification.findById(req.params.id);
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      return res.json(notification);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  
  // CREATE a notification
  notificationRouter.post('/', async (req, res) => {
    try {
      const { title, message, type, extraInfo, assignTo } = req.body;
      const newNotification = new Notification({ title, message, type, extraInfo, assignTo });
      const savedNotification = await newNotification.save();
      return res.status(201).json(savedNotification);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  
  // UPDATE a notification
  notificationRouter.put('/:id', async (req, res) => {
    try {
      const { title, message, type, extraInfo, assignTo, read } = req.body;
      const updatedNotification = await Notification.findByIdAndUpdate(
        req.params.id,
        { title, message, type, extraInfo, assignTo, read },
        { new: true }
      );
      if (!updatedNotification) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      return res.json(updatedNotification);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  
  // DELETE a notification
  notificationRouter.delete('/:id', async (req, res) => {
    try {
      const deletedNotification = await Notification.findOneAndDelete({_id: req.params.id});
      if (!deletedNotification) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      return res.json({ message: 'Notification deleted successfully' });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

export default notificationRouter;
