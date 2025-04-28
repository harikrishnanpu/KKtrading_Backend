import asyncHandler from 'express-async-handler';
import Update from '../models/updatesInfoModal.js';

/* ------- helpers ------- */
const buildQuery = ({ status, search }) => {
  const q = {};
  if (status) q.status = status;
  if (search) {
    const regex = { $regex: search, $options: 'i' };
    q.$or = [{ title: regex }, { description: regex }, { requestedByName: regex }];
  }
  return q;
};

/* ------- CRUD for updates ------- */
export const getUpdates = asyncHandler(async (req, res) => {
  const { page = 1, limit = 100, status, search } = req.query;
  const query = buildQuery({ status, search });

  const [updates, total] = await Promise.all([
    Update.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(+limit)
      .lean(),
    Update.countDocuments(query),
  ]);

  res.json({ updates, total });
});

export const createUpdate = asyncHandler(async (req, res) => {
  const { title, description = '' } = req.body;

  const update = await Update.create({
    title,
    description,
    requestedBy:     req.body._id,
    requestedByName: req.body.name,
  });

  res.status(201).json(update);
});

export const updateUpdate = asyncHandler(async (req, res) => {
  const upd = await Update.findById(req.params.id);
  if (!upd) return res.status(404).json({ msg: 'Update not found' });

  Object.assign(upd, {
    title:       req.body.title       ?? upd.title,
    description: req.body.description ?? upd.description,
    status:      req.body.status      ?? upd.status,
  });

  res.json(await upd.save());
});

export const changeStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'resolved', 'not_resolved', 'have_bugs'].includes(status))
    return res.status(400).json({ msg: 'Invalid status' });

  const upd = await Update.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!upd) return res.status(404).json({ msg: 'Update not found' });
  res.json(upd);
});

export const deleteUpdate = asyncHandler(async (req, res) => {
  await Update.findByIdAndDelete(req.params.id);
  res.json({ msg: 'Deleted' });
});

/* ------- comments ------- */
export const addComment = asyncHandler(async (req, res) => {
  const upd = await Update.findById(req.params.id);
  if (!upd) return res.status(404).json({ msg: 'Update not found' });

  upd.comments.push({
    text: req.body.text,
    commentedBy:     req.body._id,
    commentedByName: req.body.name,
  });

  res.status(201).json(await upd.save());
});

export const editComment = asyncHandler(async (req, res) => {
  const upd = await Update.findById(req.params.id);
  if (!upd) return res.status(404).json({ msg: 'Update not found' });

  const com = upd.comments.id(req.params.commentId);
  if (!com) return res.status(404).json({ msg: 'Comment not found' });

  com.text = req.body.text;
  res.json(await upd.save());
});

export const deleteComment = asyncHandler(async (req, res) => {
  const upd = await Update.findById(req.params.id);
  if (!upd) return res.status(404).json({ msg: 'Update not found' });

  const com = upd.comments.id(req.params.commentId);
  if (!com) return res.status(404).json({ msg: 'Comment not found' });

  com.remove();
  res.json(await upd.save());
});

/* ------- replies (one-level) ------- */
export const addReply = asyncHandler(async (req, res) => {
  const upd = await Update.findById(req.params.id);
  if (!upd) return res.status(404).json({ msg: 'Update not found' });

  const com = upd.comments.id(req.params.commentId);
  if (!com) return res.status(404).json({ msg: 'Comment not found' });

  com.replies.push({
    text: req.body.text,
    repliedBy:     req.body._id,
    repliedByName: req.body.name,
  });

  res.status(201).json(await upd.save());
});
