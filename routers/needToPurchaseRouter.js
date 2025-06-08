import express from "express";
import NeedToPurchase from "../models/needToPurchase.js";
import Billing from "../models/billingModal.js";
import mongoose from "mongoose";

const needToPurchaseRouter = express.Router();

/* ---------- GET all ---------- */
needToPurchaseRouter.get("/", async (req, res) => {
  try {
    const items = await NeedToPurchase.find().sort({ createdAt: -1 });
    res.json(items || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching need-to-purchase items" });
  }
});

needToPurchaseRouter.get('/paginated', async (req, res) => {
  const page  = Math.max(parseInt(req.query.page)  || 1, 1);
  const limit = Math.max(parseInt(req.query.limit) || 4, 1);
  const skip  = (page - 1) * limit;

  // Build filter
  const {
    search,
    onlyPurchased,
    onlyVerified,
    dateFrom,
    dateTo,
    salesmanName,
    remark
  } = req.query;

  const match = {};

  if (search) {
    const re = new RegExp(search.trim(), 'i');
    match.$or = [
      { invoiceNo:    re },
      { item_id:      re },
      { name:         re },
      { purchaseId:   re }
    ];
  }
  if (onlyPurchased === 'true') match.purchased = true;
  if (onlyVerified  === 'true') match.verified  = true;
  if (salesmanName) match.salesmanName = new RegExp(salesmanName.trim(), 'i');
  if (remark)       match.remark       = new RegExp(remark.trim(), 'i');
  match.verified =  false;

  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
    if (dateTo)   match.createdAt.$lte = new Date(dateTo);
  }

  try {
    const [items, totalItems, totalsByItem] = await Promise.all([
      // paginated, filtered items
      NeedToPurchase.find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      // count of filtered docs
      NeedToPurchase.countDocuments(match),
      // group‐wise totals on filtered docs
      NeedToPurchase.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$item_id',
            name:       { $first: '$name' },
            totalNeeded:{ $sum: '$quantityNeeded' }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    const totalPages = Math.ceil(totalItems / limit);
    res.json({ items, page, limit, totalItems, totalPages, totalsByItem });
  } catch (err) {
    console.error('Error fetching paginated need-to-purchase:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


/* ---------- PUT single (toggle purchased / verified / qty change) ---------- */
needToPurchaseRouter.put('/:id', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // 1) Load original
      const original = await NeedToPurchase.findById(req.params.id).session(session);
      if (!original) {
        return res.status(404).json({ message: 'Need-to-Purchase item not found' });
      }

      const oldInvoice = (original.invoiceNo || '').trim();

      // 2) Build $set for only supplied fields
      const set = {};
      if (req.body.invoiceNo        !== undefined) set.invoiceNo        = req.body.invoiceNo.trim();
      if (req.body.quantityOrdered  !== undefined) set.quantity         = req.body.quantityOrdered;
      if (req.body.quantityNeeded   !== undefined) set.quantityNeeded   = req.body.quantityNeeded;
      if (req.body.purchased        !== undefined) set.purchased        = req.body.purchased;
      if (req.body.verified         !== undefined) set.verified         = req.body.verified;
      if (req.body.purchaseId       !== undefined) set.purchaseId       = req.body.purchaseId.trim();
      if (req.body.remark           !== undefined) set.remark           = req.body.remark.trim();
      if (req.body.salesmanName     !== undefined) set.salesmanName     = req.body.salesmanName.trim();

      if (Object.keys(set).length === 0) {
        return res.status(400).json({ message: 'No valid fields supplied' });
      }

      // 3) Update & fetch new copy
      const item = await NeedToPurchase.findByIdAndUpdate(
        req.params.id,
        { $set: set },
        { new: true, session }
      );

      const newInvoice = (item.invoiceNo || '').trim();

      // 4) Helper: upsert a row in billingDoc.neededToPurchase
      const upsertRow = billDoc => {
        let row = billDoc.neededToPurchase.find(r => r.item_id === item.item_id);
        if (!row) {
          row = {
            item_id: item.item_id,
            name:    item.name,
            quantityOrdered: 0,
            quantityNeeded:  0,
            purchased:       false,
            verified:        false,
            purchaseId:      item.purchaseId,
            remark:          '',
            salesmanName:    ''
          };
          billDoc.neededToPurchase.push(row);
        }
        if (set.quantity         !== undefined) row.quantityOrdered = set.quantity;
        if (set.quantityNeeded   !== undefined) row.quantityNeeded  = set.quantityNeeded;
        if (set.purchased        !== undefined) row.purchased       = set.purchased;
        if (set.verified         !== undefined) row.verified        = set.verified;
        if (set.purchaseId       !== undefined) row.purchaseId      = set.purchaseId;
        if (set.remark           !== undefined) row.remark          = set.remark;
        if (set.salesmanName     !== undefined) row.salesmanName    = set.salesmanName;
      };

      // 5) If invoiceNo changed, remove from old billing and add to new
      if (oldInvoice !== newInvoice) {
        // 5a) Remove from old bill
        if (oldInvoice && oldInvoice !== '--') {
          const oldBill = await Billing.findOne({ invoiceNo: oldInvoice }).session(session);
          if (oldBill) {
            oldBill.neededToPurchase = oldBill.neededToPurchase.filter(r => r.item_id !== item.item_id);
            oldBill.isneededToPurchase = oldBill.neededToPurchase.length > 0;
            await oldBill.save({ session });
          }
        }
        // 5b) Add/patch in new bill
        if (newInvoice && newInvoice !== '--') {
          const newBill = await Billing.findOne({ invoiceNo: newInvoice }).session(session);
          if (!newBill) {
            return res.status(404).json({ message: `Billing '${newInvoice}' not found` });
          }
          upsertRow(newBill);
          newBill.isneededToPurchase = true;
          await newBill.save({ session });
        }
      } else {
        // 6) invoiceNo unchanged: just patch the same bill
        if (newInvoice && newInvoice !== '--') {
          const bill = await Billing.findOne({ invoiceNo: newInvoice }).session(session);
          if (!bill) {
            return res.status(404).json({ message: `Billing '${newInvoice}' not found` });
          }
          upsertRow(bill);
          bill.isneededToPurchase = true;
          await bill.save({ session });
        }
      }

      // 7) Return updated document
      res.json(item);
    });
  } catch (err) {
    console.error('NeedToPurchase PUT error:', err);
    res.status(500).json({ message: 'Error updating item', error: err.message });
  } finally {
    session.endSession();
  }
});



/* ---------- DELETE ---------- */
needToPurchaseRouter.delete("/:id", async (req, res) => {
  try {
    /* ── fetch first so we still have its details after deletion ───────── */
    const item = await NeedToPurchase.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    /* ── remove the stand-alone document ───────────────────────────────── */
    await item.deleteOne();

    /* ── mirror inside Billing (best-effort) ───────────────────────────── */
    if (item.invoiceNo && item.invoiceNo.trim() !== "--") {
      // pull the matching element from the array
      const bill = await Billing.findOneAndUpdate(
        { invoiceNo: item.invoiceNo },
        { $pull: { neededToPurchase: { item_id: item.item_id } } },
        { new: true }
      );

      // if nothing left, clear the flag
      if (
        bill &&
        bill.neededToPurchase.length === 0 &&
        bill.isneededToPurchase
      ) {
        bill.isneededToPurchase = false;
        await bill.save(); // run hooks & keep the record consistent
      }
    }

    /* ── done ──────────────────────────────────────────────────────────── */
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting item" });
  }
});

export default needToPurchaseRouter;
