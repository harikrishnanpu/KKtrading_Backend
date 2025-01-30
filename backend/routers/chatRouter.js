// backend/routes/chats.js
import express from 'express';
import Chat from '../models/chatModal.js';
import User from '../models/userModel.js';

const chatRouter = express.Router();

chatRouter.get('/', async (req, res) => {
  try {
    const messages = await Chat.find({}).sort({ time: 1 });
    return res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


chatRouter.get('/users', async (req, res) => {
    try {
      const users = await User.find({});
      return res.json({ users });
    } catch (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

// POST /api/chat - insert a new chat message
chatRouter.post('/', async (req, res) => {
  try {
    // e.g. { id, from, to, text, time }
    const { id, from, to, text } = req.body;
    const newMsg = new Chat({
      id,
      from,
      to,
      text,
      // time is set automatically if not provided
    });
    await newMsg.save();
    return res.json(newMsg);
  } catch (error) {
    console.error('Error inserting chat:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/chat/filter - filter messages for a specific user
chatRouter.post('/filter', async (req, res) => {
  try {
    // example body: { user: 'Alene', endpoints: 'chat' }
    const { user } = req.body;

    const messages = await Chat.find({
      $or: [{ from: user }, { to: user }]
    }).sort({ time: 1 });

    return res.json(messages);
  } catch (error) {
    console.error('Error filtering chat:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default chatRouter;
