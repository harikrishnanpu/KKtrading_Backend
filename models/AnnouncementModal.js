// models/announcement.model.js

import mongoose from 'mongoose';

const buttonSchema = new mongoose.Schema({
  text: { type: String, required: true },
  color: { type: String, default: 'primary' },
  url: { type: String, required: true }
});

const statusSchema = new mongoose.Schema({
  label: { type: String, default: 'Info' },
  color: { type: String, default: 'info' }
});

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    time: { type: Date, default: new Date() },
    status: { 
      type: statusSchema, 
      default: () => ({ label: 'Info', color: 'info' })
    },
    submitted: { type: String, required: true },

    // New fields:
    attachments: [{ type: String }], // array of image URLs
    buttons: [buttonSchema]          // array of buttons
  },
  {
    timestamps: true // adds createdAt, updatedAt
  }
);

const Annouuncements = mongoose.model('Announcement', announcementSchema);
export default Annouuncements;
