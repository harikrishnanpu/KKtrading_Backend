import asyncHandler from 'express-async-handler';
import PurchaseRequest from '../models/purchaseRequest.js';

/* GET /api/purchase-requests */
export const getAllRequests = asyncHandler(async (_req, res) => {
  const requests = await PurchaseRequest.find().sort({ createdAt: -1 });
  res.json(requests);
});

/* GET /api/purchase-requests/:id */
export const getRequestById = asyncHandler(async (req, res) => {
  const request = await PurchaseRequest.findById(req.params.id);
  if (!request) throw new Error('Request not found');
  res.json(request);
});

/* POST /api/purchase-requests */
export const createRequest = asyncHandler(async (req, res) => {
  const request = await PurchaseRequest.create(req.body);
  res.status(201).json(request);
});

/* PUT /api/purchase-requests/:id */
export const updateRequest = asyncHandler(async (req, res) => {
  const request = await PurchaseRequest.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );
  if (!request) throw new Error('Request not found');
  res.json(request);
});

/* DELETE /api/purchase-requests/:id */
export const deleteRequest = asyncHandler(async (req, res) => {
  const deleted = await PurchaseRequest.findByIdAndDelete(req.params.id);
  if (!deleted) throw new Error('Request not found');
  res.json({ message: 'Request removed' });
});
