import express from 'express';
import {
  getUpdates,
  createUpdate,
  updateUpdate,
  deleteUpdate,
  addComment,
  changeStatus,
} from './updatesInfo.js';

const router = express.Router();

router
  .route('/')
  .get( getUpdates)
  .post( createUpdate);

router
  .route('/:id')
  .put( updateUpdate)
  .delete( deleteUpdate);

router.post('/:id/comment', addComment);
router.patch('/:id/status', changeStatus);

export default router;
