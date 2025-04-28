import express from 'express';
import {
  getUpdates,
  createUpdate,
  updateUpdate,
  deleteUpdate,
  addComment,
  changeStatus,
} from './updatesInfo.js';

const updateInfoRouter = express.Router();

updateInfoRouter
  .route('/')
  .get(getUpdates)
  .post(createUpdate);

  updateInfoRouter
  .route('/:id')
  .put(updateUpdate)
  .delete(deleteUpdate);

  updateInfoRouter.post('/:id/comment', addComment);
  updateInfoRouter.patch('/:id/status', changeStatus);

export default updateInfoRouter;
