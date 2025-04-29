import express from 'express';
import {
  getAllRequests,
  getRequestById,
  createRequest,
  updateRequest,
  deleteRequest,
} from './purchaseRequestController.js';

const purchaseRequestRouter = express.Router();

purchaseRequestRouter.route('/')
  .get(getAllRequests)
  .post(createRequest);

  purchaseRequestRouter.route('/:id')
  .get(getRequestById)
  .put(updateRequest)
  .delete(deleteRequest);

export default purchaseRequestRouter;
