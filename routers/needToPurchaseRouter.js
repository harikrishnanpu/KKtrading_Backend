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

/* ---------- PUT single (toggle purchased / verified / qty change) ---------- */
needToPurchaseRouter.put('/:id', async (req, res) => {
  /* ---------- 0.  Optional: wrap in a transaction  ---------------- */
  const session = await mongoose.startSession();

  try {
    /* ---------- 1. fetch the original document  ------------------- */
    const original = await NeedToPurchase.findById(req.params.id).session(session);
    if (!original) {
      return res.status(404).json({ message: 'Need-to-Purchase item not found' });
    }

    const oldInvoice = (original.invoiceNo || '').trim();

    /* ---------- 2. build a clean $set ----------------------------- */
    const set = {};
    if (req.body.invoiceNo        !== undefined) set.invoiceNo        = req.body.invoiceNo.trim();
    if (req.body.quantityOrdered  !== undefined) set.quantity         = req.body.quantityOrdered;   // maps to schema field `quantity`
    if (req.body.quantityNeeded   !== undefined) set.quantityNeeded   = req.body.quantityNeeded;
    if (req.body.purchased        !== undefined) set.purchased        = req.body.purchased;
    if (req.body.verified         !== undefined) set.verified         = req.body.verified;
    if (req.body.purchaseId       !== undefined) set.purchaseId       = req.body.purchaseId;

    if (Object.keys(set).length === 0) {
      return res.status(400).json({ message: 'No valid fields supplied' });
    }

    /* ---------- 3. update and get the fresh copy ------------------ */
    const item = await NeedToPurchase.findByIdAndUpdate(
      req.params.id,
      { $set: set },
      { new: true, session }
    );

    const newInvoice = (item.invoiceNo || '').trim();

    /* ---------- 4. helper to upsert / patch a billing row --------- */
    const upsertRow = (billDoc) => {
      let row = billDoc.neededToPurchase.find(r => r.item_id === item.item_id);
      if (!row) {
        row = {
          item_id: item.item_id,
          name:    item.name,
          quantityOrdered : 0,
          quantityNeeded  : 0,
          purchased       : false,
          verified        : false,
          purchaseId      : ''
        };
        billDoc.neededToPurchase.push(row);
      }
      // copy only present fields
      if (set.quantity           !== undefined) row.quantityOrdered = set.quantity;
      if (set.quantityNeeded     !== undefined) row.quantityNeeded  = set.quantityNeeded;
      if (set.purchased          !== undefined) row.purchased       = set.purchased;
      if (set.verified           !== undefined) row.verified        = set.verified;
      if (set.purchaseId         !== undefined) row.purchaseId      = set.purchaseId;
    };

    /* ---------- 5. if invoiceNo DID change ------------------------ */
    if (oldInvoice !== newInvoice) {
      /* ---- 5a. remove from the old bill (if any) --------------- */
      if (oldInvoice && oldInvoice !== '--') {
        const oldBill = await Billing.findOne({ invoiceNo: oldInvoice }).session(session);
        if (oldBill) {
          oldBill.neededToPurchase = oldBill.neededToPurchase
            .filter(r => r.item_id !== item.item_id);
          oldBill.isneededToPurchase = oldBill.neededToPurchase.length > 0;
          await oldBill.save({ session });
        }
      }

      /* ---- 5b. add / update inside the NEW bill ---------------- */
      if (newInvoice && newInvoice !== '--') {
        const newBill = await Billing.findOne({ invoiceNo: newInvoice }).session(session);
        if (!newBill) {
          return res.status(404).json({
            message: `Billing invoice '${newInvoice}' not found`
          });
        }
        upsertRow(newBill);
        newBill.isneededToPurchase = true;
        await newBill.save({ session });
      }
    } else {
      /* ---------- 6. invoiceNo unchanged: just patch the same bill */
      if (newInvoice && newInvoice !== '--') {
        const bill = await Billing.findOne({ invoiceNo: newInvoice }).session(session);
        if (!bill) {
          return res.status(404).json({
            message: `Billing invoice '${newInvoice}' not found`
          });
        }
        upsertRow(bill);
        bill.isneededToPurchase = true;
        await bill.save({ session });
      }
    }

    /* ---------- 7. commit & respond ------------------------------ */
    res.json(item);
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
