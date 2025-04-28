import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      maxlength: [1000, 'Comment too long'],
      trim: true,
    },
    commentedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    commentedByName: String,
  },
  { timestamps: true }
);

const updateSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: {
      type:    String,
      enum:    ['pending', 'resolved', 'not_resolved', 'have_bugs'],
      default: 'pending',
    },
    requestedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: String,
    comments:        [commentSchema],
  },
  { timestamps: true }
);

export default mongoose.model('Update', updateSchema);
