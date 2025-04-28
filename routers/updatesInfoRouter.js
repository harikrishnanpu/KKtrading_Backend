import express from 'express';
import {
  getUpdates,
  createUpdate,
  updateUpdate,
  deleteUpdate,
  addComment,
  editComment,
  deleteComment,
  addReply,
  changeStatus,
} from './updatesInfo.js'
const router = express.Router();

/* update list & create */
router.route('/').get(getUpdates).post(createUpdate);

/* single update */
router.route('/:id').put(updateUpdate).delete(deleteUpdate);

/* status */
router.patch('/:id/status', changeStatus);

/* comments */
router.post('/:id/comment', addComment);
router
  .route('/:id/comment/:commentId')
  .patch(editComment)   // edit comment
  .delete(deleteComment);

/* replies (one-level) */
router.post('/:id/comment/:commentId/reply', addReply);

export default router;
