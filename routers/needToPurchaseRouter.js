import express from "express";
import NeedToPurchase from "../models/needToPurchase.js";
import Billing from "../models/billingModal.js";

const needToPurchaseRouter = express.Router();

/* ---------- GET all ---------- */
needToPurchaseRouter.get("/", async (req, res) => {
  try {
    const items = await NeedToPurchase.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching need-to-purchase items" });
  }
});

/* ---------- PUT single (toggle purchased / verified / qty change) ---------- */
needToPurchaseRouter.put('/:id', async (req, res) => {
  try {
    /* 1️⃣  update / return the stand-alone doc --------------------------- */
    const update = { $set: {} };

    // allow either field name
    if (req.body.quantityOrdered !== undefined) {
      update.$set.quantity = req.body.quantityOrdered;            //  <-- doc field
    }
    if (req.body.quantityNeeded !== undefined) {
      update.$set.quantityNeeded = req.body.quantityNeeded;
    }
    if (req.body.purchased  !== undefined) update.$set.purchased  = req.body.purchased;
    if (req.body.verified   !== undefined) update.$set.verified   = req.body.verified;
    if (req.body.purchaseId !== undefined) update.$set.purchaseId = req.body.purchaseId;

    const item = await NeedToPurchase.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    if (!item) return res.status(404).json({ message: 'Item not found' });

    /* 2️⃣  mirror the change inside Billing ----------------------------- */
    if (item.invoiceNo && item.invoiceNo.trim() !== '--') {
      const bill = await Billing.findOne({ invoiceNo: item.invoiceNo });
      if (bill) {
        let row = bill.neededToPurchase.find(r => r.item_id === item.item_id);
        if (!row) {                       // create if absent
          row = { item_id: item.item_id, name: item.name };
          bill.neededToPurchase.push(row);
        }

        // copy only what was provided
        if (req.body.quantityOrdered !== undefined)
          row.quantityOrdered = req.body.quantityOrdered;
        if (req.body.quantityNeeded  !== undefined)
          row.quantityNeeded  = req.body.quantityNeeded;
        if (req.body.purchased !== undefined)
          row.purchased = req.body.purchased;
        if (req.body.verified !== undefined)
          row.verified  = req.body.verified;
        if (req.body.purchaseId !== undefined)
          row.purchaseId = req.body.purchaseId;

        await bill.save();                // fires hooks → keeps flags accurate
      }
    }

    /* 3️⃣  done ---------------------------------------------------------- */
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating item', error: err.message });
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
