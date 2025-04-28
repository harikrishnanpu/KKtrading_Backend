import asyncHandler from 'express-async-handler';
import Update from '../models/updatesInfoModal.js';

/* helpers */
const buildQuery = ({ status, search }) => {
  const q = {};
  if (status) q.status = status;
  if (search) {
    const regex = { $regex: search, $options: 'i' };
    q.$or = [
      { title: regex },
      { description: regex },
      { requestedByName: regex },
    ];
  }
  return q;
};

/* GET /api/updates */
export const getUpdates = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, status, search } = req.query;

  const query = buildQuery({ status, search });
  const cursor = Update.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(+limit)
    .lean();

  const [updates, total] = await Promise.all([
    cursor,
    Update.countDocuments(query),
  ]);

  

  res.json(updates);
});

/* POST /api/updates */
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

/* PUT /api/updates/:id */
export const updateUpdate = asyncHandler(async (req, res) => {
  const upd = await Update.findById(req.params.id);
  if (!upd)  return res.status(404).json({ msg: 'Update not found' });

  if (req.body.title       !== undefined) upd.title       = req.body.title;
  if (req.body.description !== undefined) upd.description = req.body.description;
  if (req.body.status      !== undefined) upd.status      = req.body.status;

  const saved = await upd.save();
  res.json(saved);
});

/* PATCH /api/updates/:id/status */
export const changeStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['pending','resolved','not_resolved','have_bugs'].includes(status))
    return res.status(400).json({ msg: 'Invalid status' });

  const upd = await Update.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );
  if (!upd) return res.status(404).json({ msg: 'Update not found' });

  res.json(upd);
});

/* POST /api/updates/:id/comment */
export const addComment = asyncHandler(async (req, res) => {
  const upd = await Update.findById(req.params.id);
  if (!upd) return res.status(404).json({ msg: 'Update not found' });

  upd.comments.push({
    text: req.body.text,
    commentedBy:     req.body._id,
    commentedByName: req.body.name,
  });

  const saved = await upd.save();
  res.status(201).json(saved);
});

/* DELETE /api/updates/:id */
export const deleteUpdate = asyncHandler(async (req, res) => {
  await Update.findByIdAndDelete(req.params.id);
  res.json({ msg: 'Deleted' });
});
