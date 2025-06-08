// routes/chatRoutes.js
import express from 'express';
import ChatMessage from '../models/chatModal.js'; // Your Mongoose model
import User from '../models/userModel.js'; // Your Mongoose model for users


const router = express.Router();

/**
 * GET /api/chat/users
 * Example route to fetch 'chat users'.
 * (Alternatively, you can just call /api/users if you have a separate userRoutes.js).
 */
router.get('/users', async (req, res) => {
  try {
    // Typically, you'd query your User model here.
    // For demo, we return an empty array or mock data:
    const users = await User.find({});
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

/**
 * POST /api/chat/filter
 * Return chat messages involving a particular user (userName).
 */
router.post('/filter', async (req, res) => {
  try {
    const { user } = req.body;
    // Pull all messages from or to "user"
    const messages = await ChatMessage.find({
      $or: [{ from: user }, { to: user }]
    })
      .sort({ createdAt: 1 })
      .lean();

    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching chat messages' });
  }
});

/**
 * POST /api/chat
 * Insert a new chat message (optionally includes fileUrl).
 * The front-end is responsible for uploading to Cloudinary
 * and sending the resulting fileUrl to this route.
 */
router.post('/', async (req, res) => {
  try {
    const { from, to, text, time, fileUrl } = req.body;
    

    const newMsg = new ChatMessage({
      from,
      to,
      text,
      time,
      fileUrl // store only the Cloudinary URL (or any file URL)
    });

    const savedMsg = await newMsg.save();

    // Emit via Socket.io (if you're using it)
    const io = req.app.get('socketio');
    if (io) {
      io.emit('chatMessage', savedMsg);
    }

    res.json(savedMsg);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating new chat message' });
  }
});

export default router;
