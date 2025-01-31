// models/Event.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const eventSchema = new Schema(
  {
    title: {
      type: String,
      required: true
    },
    description: {
      type: String
    },
    color: {
      type: String,
      default: '#1890ff'
    },
    textColor: {
      type: String,
      default: '#fff'
    },
    allDay: {
      type: Boolean,
      default: false
    },
    start: {
      type: Date,
      required: true
    },
    end: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true // optional: automatically adds `createdAt` and `updatedAt`
  }
);

const Event  = model('Event', eventSchema);

export default Event;
