// taskboard.js

import express from 'express';
import Taskboard from '../models/taskBoardModal.js';
import Users from '../models/userModel.js';

// 2. INITIAL BACKLOGS (for when we create a new Taskboard)
export const initialBacklogs = {
  columns: [],
  columnsOrder: [],
  items: [],
  userStory: [],
  userStoryOrder: [],
  comments: [],
  profiles: []
};

// 3. EXPRESS ROUTER
const taskRouter = express.Router();

/**
 * Utility function to get or create a single Taskboard document.
 * If none exists, we create one with empty arrays (initialBacklogs).
 */
const getOrCreateBacklog = async (updates = null) => {
  try {
    // Find the backlog document
    let doc = await Taskboard.findOne();

    if (!doc) {
      // Create a new document with initialBacklogs if none exists
      doc = new Taskboard({
        backlogs: initialBacklogs,
      });
      await doc.save();
    }

    // If updates are provided, apply them
    if (updates) {
      // Use mongoose's `set` method to apply updates dynamically
      Object.keys(updates).forEach((key) => {
        doc.backlogs[key] = updates[key];
      });

      // Save the updated document
      await doc.save();
    }

    // Return the updated or newly created document
    return doc;
  } catch (error) {
    console.error('Error in getOrCreateBacklog:', error);
    throw new Error('Failed to get or create backlog');
  }
};


// ============== ROUTES ==============

// GET /api/taskboard
taskRouter.get('/', async (req, res) => {
  try {
    const taskboard = await getOrCreateBacklog();
    // Send the stored `backlogs` field from the document
    res.json(taskboard.backlogs);
  } catch (error) {
    console.error('Error fetching backlog:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Fetch all users
taskRouter.get('/users', async (req, res) => {
  try {
    const users = await Users.find({}).select('-__v'); // Fetch all users excluding __v field
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});




// POST /api/taskboard/master
taskRouter.post('/master', async (req, res) => {
  const { selectedItem } = req.body; // Using body parameters for POST

  if (typeof selectedItem === 'undefined') {
    return res.status(400).json({ error: 'selectedItem is required.' });
  }

  try {
    // Fetch the existing backlog from the database
    const backlog = await Taskboard.findOne();

    if (!backlog) {
      return res.status(404).json({ error: 'Backlog not found.' });
    }

    // Update the selectedItem in the backlog
    backlog.selectedItem = selectedItem;
    await backlog.save();

    // Respond with the updated backlog items
    res.json({
      message: 'Backlog updated successfully.',
      selectedItems: backlog.backlogs.items, // Assuming `items` is an array in your backlog
    });
  } catch (error) {
    console.error('Error updating backlog:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/taskboard/add-column
taskRouter.post('/add-column', async (req, res) => {
  const { column } = req.body;

  if (!column || !column.id || !column.title) {
    return res.status(400).json({ error: 'Invalid column data provided.' });
  }

  try {
    let taskboard = await Taskboard.findOne();
    if (!taskboard) {
      taskboard = new Taskboard({ backlogs: initialBacklogs });
    }

    // Check for duplicate column ID
    const existingColumn = taskboard.backlogs.columns.find(col => col.id === column.id);
    if (existingColumn) {
      return res.status(409).json({ error: 'Column with this ID already exists.' });
    }

    // Add the new column
    taskboard.backlogs.columns.push(column);
    taskboard.backlogs.columnsOrder.push(column.id);

    await taskboard.save();
    res.status(201).json(taskboard);
  } catch (error) {
    console.error('Error adding column:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/taskboard/edit-column
taskRouter.post('/edit-column', async (req, res) => {
  const { column } = req.body;

  if (!column || !column.id || !column.title) {
    return res.status(400).json({ error: 'Invalid column data provided.' });
  }

  try {
    // Retrieve the single taskboard
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Find the column sub-doc
    const idx = taskboard.backlogs.columns.findIndex(c => c.id === column.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Column not found.' });
    }

    // Update sub-document in memory
    taskboard.backlogs.columns[idx] = {
      ...taskboard.backlogs.columns[idx],
      ...column
    };

    await taskboard.save();

    res.json({ column: taskboard.backlogs.columns[idx] });
  } catch (error) {
    console.error('Error editing column:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/taskboard/update-column-order
taskRouter.post('/update-column-order', async (req, res) => {
  const { columnsOrder } = req.body;
  if (!Array.isArray(columnsOrder)) {
    return res.status(400).json({ error: 'columnsOrder must be an array of column IDs.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Optional: verify columnsOrder correctness
    const validColumnIds = taskboard.backlogs.columns.map(col => col.id);
    const isValidOrder = columnsOrder.every(id => validColumnIds.includes(id));
    if (!isValidOrder) {
      return res.status(400).json({ error: 'Invalid column IDs in columnsOrder.' });
    }

    taskboard.backlogs.columnsOrder = columnsOrder;
    await taskboard.save();

    res.json({ columnsOrder: taskboard.backlogs.columnsOrder });
  } catch (error) {
    console.error('Error updating column order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/taskboard/delete-column
taskRouter.post('/delete-column', async (req, res) => {
  const { columnId } = req.body;
  if (!columnId) {
    return res.status(400).json({ error: 'columnId is required.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Remove the column sub-doc
    const beforeCount = taskboard.backlogs.columns.length;
    taskboard.backlogs.columns = taskboard.backlogs.columns.filter(col => col.id !== columnId);
    if (taskboard.backlogs.columns.length === beforeCount) {
      // Means we didn't find a matching column
      return res.status(404).json({ error: 'Column not found.' });
    }

    // Remove the column ID from columnsOrder
    taskboard.backlogs.columnsOrder = taskboard.backlogs.columnsOrder.filter(id => id !== columnId);

    await taskboard.save();
    res.json({ message: 'Column deleted successfully.' });
  } catch (error) {
    console.error('Error deleting column:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/taskboard/add-item
taskRouter.post('/add-item', async (req, res) => {
  const { columnId, item, storyId } = req.body;
  if (!item || !item.id || !item.title) {
    return res.status(400).json({ error: 'Invalid item data provided.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Check if item with same ID already exists
    const existingItem = taskboard.backlogs.items.find(i => i.id === item.id);
    if (existingItem) {
      return res.status(409).json({ error: 'Item with this ID already exists.' });
    }

    // Add item to the items array
    taskboard.backlogs.items.push(item);

    // If columnId != '0', push itemId into that column's itemIds
    if (columnId !== '0') {
      const colIdx = taskboard.backlogs.columns.findIndex(c => c.id === columnId);
      if (colIdx === -1) {
        return res.status(404).json({ error: 'Column not found.' });
      }
      taskboard.backlogs.columns[colIdx].itemIds.push(item.id);
    }

    // If storyId != '0', push itemId into that story's itemIds
    if (storyId !== '0') {
      const storyIdx = taskboard.backlogs.userStory.findIndex(s => s.id === storyId);
      if (storyIdx === -1) {
        return res.status(404).json({ error: 'User story not found.' });
      }
      taskboard.backlogs.userStory[storyIdx].itemIds.push(item.id);
    }

    await taskboard.save();
    res.status(201).json({ item });
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// POST /api/taskboard/edit-item
// In your taskboard route file

taskRouter.post('/edit-item', async (req, res) => {
  const { columnId, newItem, storyId } = req.body;
  if (!newItem || !newItem.id || !newItem.title) {
    return res.status(400).json({ error: 'Invalid item data provided.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Find the existing item
    const itemIndex = taskboard.backlogs.items.findIndex((i) => i.id === newItem.id);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    // Merge new fields onto the existing item
    taskboard.backlogs.items[itemIndex] = {
      ...taskboard.backlogs.items[itemIndex],
      ...newItem
    };

    // Handle user story updates
    if (storyId) {
      // 1) Remove item from all other stories
      for (const s of taskboard.backlogs.userStory) {
        if (s.id !== storyId) {
          s.itemIds = s.itemIds.filter((id) => id !== newItem.id);
        }
      }
      // 2) If storyId != '0', add the item to the specified story
      if (storyId !== '0') {
        const idx = taskboard.backlogs.userStory.findIndex((s) => s.id === storyId);
        if (idx === -1) {
          return res.status(404).json({ error: 'User story not found.' });
        }
        if (!taskboard.backlogs.userStory[idx].itemIds.includes(newItem.id)) {
          taskboard.backlogs.userStory[idx].itemIds.push(newItem.id);
        }
      }
    }

    // Handle column updates
    if (columnId) {
      // 1) Remove item from all other columns
      for (const c of taskboard.backlogs.columns) {
        if (c.id !== columnId) {
          c.itemIds = c.itemIds.filter((id) => id !== newItem.id);
        }
      }
      // 2) If columnId != '0', add the item to the specified column
      if (columnId !== '0') {
        const colIndex = taskboard.backlogs.columns.findIndex((c) => c.id === columnId);
        if (colIndex === -1) {
          return res.status(404).json({ error: 'Column not found.' });
        }
        if (!taskboard.backlogs.columns[colIndex].itemIds.includes(newItem.id)) {
          taskboard.backlogs.columns[colIndex].itemIds.push(newItem.id);
        }
      }
    }

    await taskboard.save();
    return res.json({ item: taskboard.backlogs.items[itemIndex] });
  } catch (error) {
    console.error('Error editing item:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// POST /api/taskboard/update-column-item-order
taskRouter.post('/update-column-item-order', async (req, res) => {
  const { columns } = req.body;
  if (!Array.isArray(columns)) {
    return res.status(400).json({ error: 'columns must be an array.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Update each column's itemIds
    for (let columnData of columns) {
      const colIdx = taskboard.backlogs.columns.findIndex(c => c.id === columnData.id);
      if (colIdx === -1) {
        return res.status(404).json({ error: `Column with id ${columnData.id} not found.` });
      }
      // Optionally validate itemIds
      taskboard.backlogs.columns[colIdx].itemIds = columnData.itemIds;
    }

    await taskboard.save();
    res.json({ message: 'Column item order updated successfully.' });
  } catch (error) {
    console.error('Error updating column item order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/taskboard/add-item-comment
taskRouter.post('/add-item-comment', async (req, res) => {
  const { itemId, comment } = req.body;
  if (!itemId || !comment || !comment.id || !comment.content || !comment.author) {
    return res.status(400).json({ error: 'Invalid comment data provided.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Add comment sub-doc if it doesn't exist
    const existingComment = taskboard.backlogs.comments.find(c => c.id === comment.id);
    if (existingComment) {
      return res.status(409).json({ error: 'Comment with this ID already exists.' });
    }
    taskboard.backlogs.comments.push(comment);

    // Find the item sub-doc and add the comment ID
    const itemIdx = taskboard.backlogs.items.findIndex(i => i.id === itemId);
    if (itemIdx === -1) {
      return res.status(404).json({ error: 'Item not found.' });
    }
    taskboard.backlogs.items[itemIdx].commentIds.push(comment.id);

    await taskboard.save();
    res.status(201).json({ comment });
  } catch (error) {
    console.error('Error adding item comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/taskboard/delete-item
taskRouter.post('/delete-item', async (req, res) => {
  const { itemId } = req.body;
  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Remove the item from items array
    const beforeCount = taskboard.backlogs.items.length;
    taskboard.backlogs.items = taskboard.backlogs.items.filter(i => i.id !== itemId);
    if (taskboard.backlogs.items.length === beforeCount) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    // Remove itemId from all columns
    for (let c of taskboard.backlogs.columns) {
      c.itemIds = c.itemIds.filter(id => id !== itemId);
    }

    // Remove itemId from all user stories
    for (let s of taskboard.backlogs.userStory) {
      s.itemIds = s.itemIds.filter(id => id !== itemId);
    }

    await taskboard.save();
    res.json({ message: 'Item deleted successfully.' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/taskboard/add-story
taskRouter.post('/add-story', async (req, res) => {
  const { story } = req.body;

  if (!story || !story.id || !story.title || !story.dueDate || !story.columnId) {
    return res.status(400).json({ error: 'Invalid story data provided. Ensure id, title, dueDate, and columnId are included.' });
  }

  // Validate and convert fields
  try {
    story.dueDate = new Date(story.dueDate);
    if (isNaN(story.dueDate.getTime())) {
      throw new Error('Invalid dueDate format.');
    }

    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Check for duplicate story ID
    const existingStory = taskboard.backlogs.userStory.find((s) => s.id === story.id);
    if (existingStory) {
      return res.status(409).json({ error: 'Story with this ID already exists.' });
    }

    // Add the new story
    taskboard.backlogs.userStory.push(story);
    taskboard.backlogs.userStoryOrder.push(story.id); 
    await taskboard.save();

    res.status(201).json({ story });
  } catch (error) {
    console.error('Error adding story:', error.message || error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


// POST /api/taskboard/edit-story
// routes/taskboard.js
taskRouter.post('/edit-story', async (req, res) => {
  const { story } = req.body;
  if (!story || !story.id || !story.title) {
    return res.status(400).json({ error: 'Invalid story data provided.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    const storyIdx = taskboard.backlogs.userStory.findIndex((s) => s.id === story.id);
    if (storyIdx === -1) {
      return res.status(404).json({ error: 'Story not found.' });
    }

    // Get the existing story
    const existingStory = taskboard.backlogs.userStory[storyIdx];

    // Merge new data with the existing story fields
    // itemIds: if not provided or undefined, keep the old array
    taskboard.backlogs.userStory[storyIdx] = {
      ...existingStory,
      ...story,
      itemIds: story.itemIds ?? existingStory.itemIds
    };

    await taskboard.save();
    return res.json({ story: taskboard.backlogs.userStory[storyIdx] });
  } catch (error) {
    console.error('Error editing story:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});



// POST /api/taskboard/update-story-order
taskRouter.post('/update-story-order', async (req, res) => {
  const { userStoryOrder } = req.body;
  if (!Array.isArray(userStoryOrder)) {
    return res.status(400).json({ error: 'userStoryOrder must be an array of story IDs.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Optional: verify userStoryOrder correctness
    const validStoryIds = taskboard.backlogs.userStory.map(s => s.id);
    const isValidOrder = userStoryOrder.every(id => validStoryIds.includes(id));
    if (!isValidOrder) {
      return res.status(400).json({ error: 'Invalid story IDs in userStoryOrder.' });
    }

    taskboard.backlogs.userStoryOrder = userStoryOrder;
    await taskboard.save();

    res.json({ userStoryOrder: taskboard.backlogs.userStoryOrder });
  } catch (error) {
    console.error('Error updating story order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/taskboard/update-storyitem-order
taskRouter.post('/update-storyitem-order', async (req, res) => {
  const { userStory } = req.body;
  if (!Array.isArray(userStory)) {
    return res.status(400).json({ error: 'userStory must be an array.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    for (let storyData of userStory) {
      const idx = taskboard.backlogs.userStory.findIndex(s => s.id === storyData.id);
      if (idx === -1) {
        return res.status(404).json({ error: `Story with id ${storyData.id} not found.` });
      }
      // Update itemIds
      taskboard.backlogs.userStory[idx].itemIds = storyData.itemIds;
    }

    await taskboard.save();
    res.json({ message: 'Story item order updated successfully.' });
  } catch (error) {
    console.error('Error updating story item order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/taskboard/add-story-comment
taskRouter.post('/add-story-comment', async (req, res) => {
  const { storyId, comment } = req.body;

  if (!storyId || !comment || !comment.id || !comment.content || !comment.author) {
    return res.status(400).json({ error: 'Invalid comment data provided.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Add the comment if it doesn't exist
    const existingComment = taskboard.backlogs.comments.find(c => c.id === comment.id);
    if (existingComment) {
      return res.status(409).json({ error: 'Comment with this ID already exists.' });
    }
    taskboard.backlogs.comments.push(comment);

    // Find the story sub-doc
    const storyIdx = taskboard.backlogs.userStory.findIndex(s => s.id === storyId);
    if (storyIdx === -1) {
      return res.status(404).json({ error: 'Story not found.' });
    }

    taskboard.backlogs.userStory[storyIdx].commentIds.push(comment.id);

    await taskboard.save();
    res.status(201).json({ comment });
  } catch (error) {
    console.error('Error adding story comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/taskboard/delete-story
taskRouter.post('/delete-story', async (req, res) => {
  const { storyId } = req.body;
  if (!storyId) {
    return res.status(400).json({ error: 'storyId is required.' });
  }

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Remove the story from userStory array
    const beforeCount = taskboard.backlogs.userStory.length;
    taskboard.backlogs.userStory = taskboard.backlogs.userStory.filter(s => s.id !== storyId);
    if (taskboard.backlogs.userStory.length === beforeCount) {
      return res.status(404).json({ error: 'Story not found.' });
    }

    // Remove from userStoryOrder
    taskboard.backlogs.userStoryOrder = taskboard.backlogs.userStoryOrder.filter(id => id !== storyId);

    await taskboard.save();
    res.json({ message: 'Story deleted successfully.' });
  } catch (error) {
    console.error('Error deleting story:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




// e.g., DELETE /delete-item-comment
taskRouter.delete('/delete-item-comment', async (req, res) => {
  const { itemId, commentId } = req.body;

  try {
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // Remove comment from comments[]
    taskboard.backlogs.comments = taskboard.backlogs.comments.filter(
      (c) => c.id !== commentId
    );

    // Remove commentId from the item's commentIds
    const itemIndex = taskboard.backlogs.items.findIndex((it) => it.id === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found.' });
    }
    taskboard.backlogs.items[itemIndex].commentIds = taskboard.backlogs.items[
      itemIndex
    ].commentIds.filter((id) => id !== commentId);

    await taskboard.save();
    return res.status(200).json({ message: 'Comment deleted successfully.' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});



taskRouter.delete('/delete-story-comment', async (req, res) => {
  const { storyId, commentId } = req.body;

  // Basic validation
  if (!storyId || !commentId) {
    return res.status(400).json({ error: 'Invalid request data.' });
  }

  try {
    // 1. Find the Taskboard doc
    const taskboard = await Taskboard.findOne();
    if (!taskboard) {
      return res.status(404).json({ error: 'Taskboard not found.' });
    }

    // 2. Remove the comment from backlogs.comments
    taskboard.backlogs.comments = taskboard.backlogs.comments.filter(
      (c) => c.id !== commentId
    );

    // 3. Find the user story by ID
    const storyIndex = taskboard.backlogs.userStory.findIndex((s) => s.id === storyId);
    if (storyIndex === -1) {
      return res.status(404).json({ error: 'Story not found.' });
    }

    // 4. Remove the comment ID from this story's commentIds
    taskboard.backlogs.userStory[storyIndex].commentIds =
      taskboard.backlogs.userStory[storyIndex].commentIds.filter(
        (id) => id !== commentId
      );

    // 5. Save changes
    await taskboard.save();
    return res.status(200).json({ message: 'Comment deleted successfully.' });
  } catch (error) {
    console.error('Error deleting story comment:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. EXPORT THE ROUTER AND THE MODEL (IF NEEDED)
// Typically, you'd import `taskRouter` in your server.js and do:
// app.use('/api/taskboard', taskRouter);

export default taskRouter;
