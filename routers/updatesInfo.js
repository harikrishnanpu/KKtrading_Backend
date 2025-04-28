import Update from '../models/updatesInfoModal.js';

// GET /api/updates?status=&search=
export const getUpdates = async (req, res) => {
  const { status, search } = req.query;
  const q = {};

  if (status) q.status = status;
  if (search)
    q.$or = [
      { title:        { $regex: search, $options: 'i' } },
      { description:  { $regex: search, $options: 'i' } },
      { requestedByName: { $regex: search, $options: 'i' } },
    ];

  const updates = await Update.find(q).sort({ createdAt: -1 });
  res.json(updates);
};

// POST /api/updates
export const createUpdate = async (req, res) => {
  const { title, description } = req.body;
  const update = await Update.create({
    title,
    description,
    requestedBy:     req.body._id,
    requestedByName: req.body.name,
  });
  res.status(201).json(update);
};

// PUT /api/updates/:id
export const updateUpdate = async (req, res) => {
  const upd = await Update.findById(req.params.id);
  if (!upd) return res.status(404).json({ msg: 'Update not found' });

  upd.title       = req.body.title      ?? upd.title;
  upd.description = req.body.description?? upd.description;
  upd.status      = req.body.status     ?? upd.status;

  const saved = await upd.save();
  res.json(saved);
};

// PATCH /api/updates/:id/status
export const changeStatus = async (req, res) => {
  const upd = await Update.findById(req.params.id);
  if (!upd) return res.status(404).json({ msg: 'Update not found' });
  upd.status = req.body.status;
  const saved = await upd.save();
  res.json(saved);
};

// POST /api/updates/:id/comment
export const addComment = async (req, res) => {
  const upd = await Update.findById(req.params.id);
  if (!upd) return res.status(404).json({ msg: 'Update not found' });

  upd.comments.push({
    text: req.body.text,
    commentedBy:     req.body._id,
    commentedByName: req.body.name,
  });

  const saved = await upd.save();
  res.status(201).json(saved);
};

// DELETE /api/updates/:id  (admin-only)
export const deleteUpdate = async (req, res) => {
  await Update.findByIdAndDelete(req.params.id);
  res.json({ msg: 'Deleted' });
};
