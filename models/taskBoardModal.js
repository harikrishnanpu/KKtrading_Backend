// Import Mongoose
import mongoose from 'mongoose';

// A. Column sub-document schema
const ColumnSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    itemIds: [{ type: String }] // Stores IDs of items (strings for simplicity)
  },
  { _id: false }
);

// B. Item sub-document schema
const ItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    commentIds: [{ type: String }],
    assign: { type: String, default: '' },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low' // Ensure it matches your enum
    },
    dueDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['To Do', 'In Progress', 'Done'],
      default: 'To Do'
    },
    attachments: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    _id: false,
    timestamps: true // Manages createdAt and updatedAt automatically
  }
);

// C. Profile sub-document schema
const ProfileSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    avatar: { type: String, required: true },
    time: { type: Date, default: Date.now },
    role: { type: String, default: 'user' }
  },
  { _id: false }
);

// D. Comment sub-document schema
const CommentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    content: { type: String, required: true },
    time: { type: Date, default: Date.now },
    author: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

// E. UserStory sub-document schema
const UserStorySchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    assign: { type: String, required: true },
    columnId: { type: String, required: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    dueDate: { type: Date, required: true },
    acceptance: { type: String, default: '' },
    description: { type: String, default: '' },
    commentIds: [{ type: String }],
    image: { type: Boolean, default: false },
    itemIds: [{ type: String }],
    files: [{ type: String }]
  },
  { _id: false }
);

// F. Backlogs schema (contains arrays of sub-documents)
const BacklogsSchema = new mongoose.Schema(
  {
    columns: [ColumnSchema],
    columnsOrder: [String],
    items: [ItemSchema],
    userStory: [UserStorySchema],
    userStoryOrder: [String],
    comments: [CommentSchema],
    profiles: [ProfileSchema]
  },
  { _id: false }
);

// G. Main Taskboard schema (one sub-document: backlogs)
const TaskboardSchema = new mongoose.Schema(
  {
    backlogs: { type: BacklogsSchema, default: {} },
    selectedItem: { type: Object, default: null } // Flexible structure
  },
  { timestamps: true }
);

// H. Create & Export the Taskboard model
const Taskboard = mongoose.model('Taskboard', TaskboardSchema);
export default Taskboard;
