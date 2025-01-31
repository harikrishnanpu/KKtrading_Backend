import express from 'express';
import asyncHandler from 'express-async-handler';
import Product from '../models/productModel.js';
import StockOpening from '../models/stockOpeningModal.js';

const stockUpdateRouter = express.Router();

/**
 * GET /api/stock-update/search-products
 * Search products by query (name or item_id)
 * Query params: q (string)
 */
stockUpdateRouter.get('/search-products', asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim() === '') {
    return res.json([]);
  }

  // Search by name or item_id (case-insensitive)
  const regex = new RegExp(q, 'i');
  const products = await Product.find({
    $or: [{ name: regex }, { item_id: regex }],
  })
    .limit(20)
    .lean();

  res.json(products);
}));

/**
 * POST /api/stock-update/create
 * Create a new stock update log and update product stock.
 * Body: { item_id, quantityChange, submittedBy, remark }
 * quantityChange can be + or - number.
 */
stockUpdateRouter.post('/create', asyncHandler(async (req, res) => {
  const { item_id, quantityChange, submittedBy, remark } = req.body;

  if (!item_id || !quantityChange || !submittedBy) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  const product = await Product.findOne({ item_id });
  if (!product) {
    return res.status(404).json({ message: 'Product not found.' });
  }

  const parsedQuantity = parseFloat(quantityChange);
  if (isNaN(parsedQuantity) || parsedQuantity === 0) {
    return res.status(400).json({ message: 'Invalid quantity change.' });
  }

  // Check if subtracting more than in stock
  if (parsedQuantity < 0 && product.countInStock < Math.abs(parsedQuantity)) {
    return res.status(400).json({ message: 'Not enough stock to subtract.' });
  }

  // Update product stock
  product.countInStock += parsedQuantity;
  await product.save();

  // Create log entry
  const logEntry = new StockOpening({
    item_id: product.item_id,
    name: product.name,
    quantity: parsedQuantity,
    submittedBy,
    remark: remark || '',
    date: new Date(),
  });
  await logEntry.save();

  res.json({ message: 'Stock updated successfully.', log: logEntry });
}));

/**
 * GET /api/stock-update/logs
 * Fetch all stock update logs with optional filters:
 * Query params:
 *  - fromDate, toDate (YYYY-MM-DD)
 *  - name (product name search)
 *  - brand, category
 *  - sortField (date, name, quantity)
 *  - sortDirection (asc, desc)
 */
stockUpdateRouter.get('/logs', asyncHandler(async (req, res) => {
  const { fromDate, toDate, name, brand, category, sortField = 'date', sortDirection = 'desc' } = req.query;

  const query = {};

  if (fromDate || toDate) {
    query.date = {};
    if (fromDate) {
      query.date.$gte = new Date(fromDate);
    }
    if (toDate) {
      // To include the entire day, set time to end of the day
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      query.date.$lte = endDate;
    }
  }

  if (name && name.trim() !== '') {
    query.name = { $regex: name, $options: 'i' };
  }

  // Since brand and category are not stored in StockOpening, 
  // you'd either need to store them in StockOpening as well,
  // or fetch product details. For simplicity, let's store brand and category in StockOpening.
  if (brand && brand.trim() !== '') {
    query.brand = { $regex: brand, $options: 'i' };
  }

  if (category && category.trim() !== '') {
    query.category = { $regex: category, $options: 'i' };
  }

  // We'll assume brand & category fields are added to StockOpening at creation time by looking up the product once.

  let sort = {};
  if (sortField) {
    sort[sortField] = sortDirection === 'asc' ? 1 : -1;
  } else {
    sort = { date: -1 };
  }

  // If brand/category is not stored in StockOpening model currently,
  // you need to modify the creation logic in POST /create to also fetch and store brand/category.

  const logs = await StockOpening.find(query).sort(sort).lean();
  res.json(logs);
}));

/**
 * DELETE /api/stock-update/:id
 * Delete a stock update log and revert product stock.
 */
stockUpdateRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const logEntry = await StockOpening.findById(id);
  if (!logEntry) {
    return res.status(404).json({ message: 'Log entry not found.' });
  }

  const product = await Product.findOne({ item_id: logEntry.item_id });
  if (!product) {
    // Product not found, just delete the log?
    await logEntry.deleteOne();
    return res.json({ message: 'Log deleted, but product not found. Stock not reverted.' });
  }

  // Revert stock
  product.countInStock -= logEntry.quantity; // If the log was +10, we do -10 now
  await product.save();

  await logEntry.deleteOne();

  res.json({ message: 'Stock update log deleted and stock reverted successfully.' });
}));

export default stockUpdateRouter;
