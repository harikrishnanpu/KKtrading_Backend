import express from 'express';
import asyncHandler from 'express-async-handler';
import Product from '../models/productModel.js';
import StockOpening from '../models/stockOpeningModal.js';
import StockRegistry from '../models/StockregistryModel.js';
import mongoose from 'mongoose';

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
  const session = await mongoose.startSession();
  const { item_id, quantityChange, submittedBy, remark } = req.body;

  if (!item_id || !quantityChange || !submittedBy) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  const parsedQuantity = parseFloat(quantityChange);
  if (isNaN(parsedQuantity) || parsedQuantity === 0) {
    return res.status(400).json({ message: 'Invalid quantity change.' });
  }

  let responsePayload = null;

  try {
    await session.withTransaction(async () => {
      const product = await Product.findOne({ item_id }).session(session);
      if (!product) {
        throw new Error('NOT_FOUND');
      }

      // Prevent negative stock
      if (parsedQuantity < 0 && product.countInStock < Math.abs(parsedQuantity)) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      // Update stock
      product.countInStock += parsedQuantity;
      await product.save({ session });

      // Log entry
      const logEntry = new StockOpening({
        item_id: product.item_id,
        name: product.name,
        quantity: parsedQuantity,
        submittedBy,
        remark: remark || '',
        date: new Date(),
      });

      await logEntry.save({ session });

      // StockRegistry entry
      const stockEntry = new StockRegistry({
        date: new Date(),
        updatedBy: submittedBy,
        itemId: product.item_id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        changeType: parsedQuantity > 0 ? 'Manual Addition' : 'Manual Reduction',
        invoiceNo: 'N/A',
        quantityChange: parsedQuantity,
        finalStock: product.countInStock,
      });

      await stockEntry.save({ session });

      responsePayload = {
        message: 'Stock updated successfully.',
        log: logEntry,
      };
    });

    if (responsePayload) {
      res.status(200).json(responsePayload);
    } else {
      res.status(500).json({ message: 'Transaction completed, but no response generated.' });
    }
  } catch (err) {
    console.error(err);
    if (err.message === 'NOT_FOUND') {
      res.status(404).json({ message: 'Product not found.' });
    } else if (err.message === 'INSUFFICIENT_STOCK') {
      res.status(400).json({ message: 'Not enough stock to subtract.' });
    } else {
      res.status(500).json({ message: 'Stock update failed.' });
    }
  } finally {
    await session.endSession();
  }
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
stockUpdateRouter.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const {
      fromDate,
      toDate,
      name,
      brand,
      category,
      sortField = 'date',
      sortDirection = 'desc',
      page = 1,
      limit = 15
    } = req.query;

    /* ───── filters ─────────────────────────────────────────── */
    const query = {};

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    if (name)      query.name     = { $regex: name,     $options: 'i' };
    if (brand)     query.brand    = { $regex: brand,    $options: 'i' };
    if (category)  query.category = { $regex: category, $options: 'i' };

    /* ───── sort ────────────────────────────────────────────── */
    const sort = { [sortField]: sortDirection === 'asc' ? 1 : -1 };

    /* ───── pagination ─────────────────────────────────────── */
    const skip  = (Number(page) - 1) * Number(limit);
    const total = await StockOpening.countDocuments(query);

    const logs = await StockOpening.find(query)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    res.json({ logs, total });
  })
);

/**
 * DELETE /api/stock-update/:id
 * Delete a stock update log and revert product stock.
 */
stockUpdateRouter.delete('/:id', asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  const { id } = req.params;
  let responseData = null;

  try {
    await session.withTransaction(async () => {
      const logEntry = await StockOpening.findById(id).session(session);
      if (!logEntry) {
        throw new Error('NOT_FOUND'); // Use custom error string
      }

      const product = await Product.findOne({ item_id: logEntry.item_id }).session(session);
      if (!product) {
        await logEntry.deleteOne({ session });
        responseData = { message: 'Log deleted, but product not found. Stock not reverted.' };
        return;
      }

      product.countInStock -= logEntry.quantity;
      await product.save({ session });

      const stockEntry = new StockRegistry({
        date: new Date(),
        updatedBy: 'System',
        itemId: product.item_id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        changeType: 'Reverted Stock Update (Deletion)',
        invoiceNo: 'N/A',
        quantityChange: -logEntry.quantity,
        finalStock: product.countInStock,
      });

      await stockEntry.save({ session });
      await logEntry.deleteOne({ session });

      responseData = { message: 'Stock update log deleted and stock reverted successfully.' };
    });

    if (responseData) {
      res.status(200).json(responseData);
    } else {
      res.status(500).json({ message: 'Transaction completed, but no response generated.' });
    }
  } catch (err) {
    console.error(err);
    if (err.message === 'NOT_FOUND') {
      res.status(404).json({ message: 'Log entry not found.' });
    } else {
      res.status(500).json({ message: 'Stock update unsuccessful.' });
    }
  } finally {
    await session.endSession();
  }
}));



export default stockUpdateRouter;
