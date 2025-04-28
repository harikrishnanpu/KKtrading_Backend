import mongoose from 'mongoose';

/* ---------- sub-schemas ---------- */
const replySchema = new mongoose.Schema(
  {
    text:        { type: String, required: true, trim: true, maxlength: 1000 },
    repliedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    repliedByName: String,
  },
  { timestamps: true }
);

const commentSchema = new mongoose.Schema(
  {
    text:        { type: String, required: true, trim: true, maxlength: 1000 },
    commentedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    commentedByName: String,
    replies:     [replySchema],          // ONE-LEVEL replies
  },
  { timestamps: true }
);

const updateSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: '' },          // HTML string from React-Quill
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
