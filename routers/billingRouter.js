import express from 'express';
import Billing from '../models/billingModal.js';
import Product from '../models/productModel.js';
import mongoose from 'mongoose';
import User from '../models/userModel.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';
import CustomerAccount from '../models/customerModal.js';
import SupplierAccount from '../models/supplierAccountModal.js';
import Location from '../models/locationModel.js';
import StockRegistry from '../models/StockregistryModel.js';
import NeedToPurchase from '../models/needToPurchase.js';
import expressAsyncHandler from 'express-async-handler';

const billingRouter = express.Router();

// =========================
// Route: Create Billing Entry
// =========================
billingRouter.post('/create', async (req, res) => {
  const session = await mongoose.startSession();

  try {
  let billingData = null;
  await session.withTransaction(async () => {
    const {
      invoiceDate,
      salesmanName,
      expectedDeliveryDate,
      deliveryStatus = 'Pending',
      grandTotal,
      billingAmount,
      discount = 0,
      customerId,
      customerName,
      customerAddress,
      customerContactNumber,
      marketedBy,
      paymentAmount,
      paymentMethod,
      paymentReceivedDate,
      salesmanPhoneNumber,
      roundOff,
      roundOffMode,
      unloading = 0,
      transportation = 0,
      handlingcharge = 0,
      remark,
      showroom,
      userId,
      isApproved,
      products, // Expected to be an array of objects with item_id and quantity
      isneededToPurchase
    } = req.body;

    let { invoiceNo } = req.body;

    const referenceId = 'BILL' + Date.now().toString();

    // -----------------------
    // 1. Validate Required Fields
    // -----------------------
    if (
      !invoiceNo ||
      !invoiceDate ||
      !salesmanName ||
      !customerName ||
      !customerAddress ||
      !customerId ||
      !products ||
      !salesmanPhoneNumber ||
      !Array.isArray(products) ||
      products.length === 0
    ) {
      throw new Error('Missing required fields');
    }

    // -----------------------
    // 2. Check for Existing Invoice
    // -----------------------
    const existingBill = await Billing.findOne({}).sort({ createdAt: -1  }).session(session);
    if (existingBill) {
      const billing = await Billing.findOne({ invoiceNo: /^KK\d+$/ })
      .sort({ invoiceNo: -1 })
      .collation({ locale: "en", numericOrdering: true });

      if (billing) {
        const lastInvoiceNumber = parseInt(billing.invoiceNo.slice(2), 10) || 0; // Extract the number part after "KK"
        invoiceNo = "KK" + (lastInvoiceNumber + 1).toString().padStart(2, '0'); // Ensures at least two digits
      } else {
        throw new Error("Error generating new invoice number" );
      }

    }

    // -----------------------
    // 3. Calculate Total Amount After Discount
    // -----------------------
    const parsedBillingAmount = parseFloat(billingAmount);
    const parsedDiscount = parseFloat(discount);

    if (isNaN(parsedBillingAmount) || parsedBillingAmount <= 0) {
      throw new Error( 'Invalid billing amount' );
    }

    if (isNaN(parsedDiscount) || parsedDiscount < 0) {
      throw new Error('Invalid discount amount' );
    }

    const totalAmount = parsedBillingAmount - parsedDiscount;
    if (totalAmount < 0) {
    throw new Error( 'Discount cannot exceed billing amount' );
    }

    // -----------------------
    // 4. Fetch and Validate User
    // -----------------------
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found' );
    }

    const isAdmin = user.isAdmin;

    // -----------------------
    // 5. Find or Create Customer Account
    // -----------------------



    let customerAccount = await CustomerAccount.findOne({
      customerId: customerId.trim(),
    }).session(session);

    if (!customerAccount) {
      // Create new customer account
      customerAccount = new CustomerAccount({
        customerId: customerId.trim(),
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim(),
        customerContactNumber: customerContactNumber.trim(),
        bills: [], // Initialize bills array
        payments: [], // Initialize payments array
      });
    }

    // Check if the bill with the same invoiceNo already exists in customer's bills array
    const existingBillInCustomer = customerAccount.bills.find(
      (bill) => bill.invoiceNo === invoiceNo.trim()
    );

    if (existingBillInCustomer) {
        throw new Error( `Invoice number ${invoiceNo} already exists for this customer`);
    }

    // -----------------------
    // 6. Initialize Billing Data
    // -----------------------
     billingData = new Billing({
      invoiceNo: invoiceNo.trim(),
      invoiceDate: new Date(invoiceDate),
      salesmanName: salesmanName.trim(),
      expectedDeliveryDate: new Date(expectedDeliveryDate),
      deliveryStatus,
      grandTotal: parseFloat(grandTotal),
      billingAmount: parsedBillingAmount,
      discount: parsedDiscount,
      customerId: customerId.trim(),
      customerName: customerName.trim(),
      customerAddress: customerAddress.trim(),
      customerContactNumber: customerContactNumber.trim(),
      marketedBy: marketedBy ? marketedBy.trim() : '',
      submittedBy: userId,
      roundOff: parseFloat(roundOff) || 0,
      showroom: showroom,
      handlingCharge: parseFloat(handlingcharge),
      remark: remark ? remark.trim() : '',
      products,
      unloading: parseFloat(unloading),
      transportation: parseFloat(transportation),
      payments: [], // Initialize payments as an empty array
      isApproved: isAdmin && isApproved ? true : false, // Automatically approve if user is admin
      salesmanPhoneNumber: salesmanPhoneNumber.trim(),
      roundOffMode: roundOffMode,
      isneededToPurchase: isneededToPurchase
    });

    // -----------------------
    // 7. Associate Bill with Customer Account
    // -----------------------
    customerAccount.bills.push({
      invoiceNo: invoiceNo.trim(),
      billAmount: parseFloat(grandTotal),
      invoiceDate: new Date(invoiceDate),
      deliveryStatus,
    });

    // -----------------------
    // 8. Add Initial Payment if Provided
    // -----------------------
    if (paymentAmount && paymentMethod) {
      const parsedPaymentAmount = parseFloat(paymentAmount);

      // Validate payment amount
      if (isNaN(parsedPaymentAmount) || parsedPaymentAmount <= 0) {
        throw new Error('Invalid payment amount');
      }

      const currentDate = paymentReceivedDate
      ? new Date(paymentReceivedDate) // parse manually with IST
      : new Date(); 

      const paymentReferenceId = 'PAY' + Date.now().toString();

      const paymentEntry = {
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        date: currentDate,
        referenceId: paymentReferenceId,
        invoiceNo: invoiceNo.trim(), // Link payment to billing
      };

      const accountPaymentEntry = {
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        remark: `Bill ${invoiceNo.trim()}`,
        submittedBy: userId,
        date: currentDate,
        referenceId: paymentReferenceId,
      };

      const account = await PaymentsAccount.findOne({
        accountId: paymentMethod.trim(),
      }).session(session);

      if (!account) {
          throw new Error('Payment account not found');
      }

      account.paymentsIn.push(accountPaymentEntry);
      await account.save({ session });

      // Add payment to CustomerAccount's payments array with invoiceNo
      customerAccount.payments.push({
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        remark: `Bill ${invoiceNo.trim()}`,
        submittedBy: userId,
        date: currentDate,
        referenceId: paymentReferenceId,
        invoiceNo: invoiceNo.trim(),
      });

      // Add the payment to the billing payments array with invoiceNo
      billingData.payments.push(paymentEntry);
    }

    // -----------------------
    // 9. Update Salesman Phone Number
    // -----------------------
    const salesmanUser = await User.findOne({
      name: salesmanName.trim(),
    }).session(session);
    if (salesmanUser) {
      salesmanUser.contactNumber = salesmanPhoneNumber.trim();
      await salesmanUser.save({ session });
    } else {
            throw new Error('Salesman user not found');
    }

    // -----------------------
// 10. Identify Out of Stock Products Instead of Updating Stock
// -----------------------
const neededToPurchaseItems = [];

for (const item of products) {
  const { item_id, quantity } = item;

  // Validate individual product details
  if (!item_id || isNaN(quantity) || quantity <= 0) {
   throw new Error('Invalid product details');
  }

  // Fetch product using item_id
  const product = await Product.findOne({ item_id: item_id.trim() }).session(session);
  if (!product) {
  throw new Error(`Product with ID ${item_id} not found` );
  }

  // Check stock level
  if (product.countInStock < quantity) {
    const quantityNeeded = quantity - product.countInStock;

    neededToPurchaseItems.push({
      item_id: item_id.trim(),
      name: product.name,
      quantityOrdered: quantity,
      quantityNeeded,
      purchased: false,
      verified: false,
      purchaseId: null,
      salesmanName: salesmanName
    });

  }

}



if (neededToPurchaseItems.length > 0) {
  billingData.neededToPurchase = neededToPurchaseItems;

  for (const item of neededToPurchaseItems) {
    const existingNeed = await NeedToPurchase.findOne({
      item_id: item.item_id,
      purchased: false,
    }).session(session);
  
    if (existingNeed) {
      existingNeed.quantityNeeded += item.quantityNeeded;
      await existingNeed.save({ session });
    } else {
      await NeedToPurchase.create([{
        item_id: item.item_id,
        name: item.name,
        quantity: item.quantityOrdered,
        quantityNeeded: item.quantityNeeded,
        requestedBy: billingData.customerName || 'Unknown', // optional
        invoiceNo: billingData.invoiceNo || '',             // optional
        purchased: false,
        verified: false,
        purchaseId: null,
        salesmanName: salesmanName
      }], { session });
    }
  }
}



    // -----------------------
    // 11. Save Billing Data and Update Products
    // -----------------------
    await customerAccount.save({ session });
    await billingData.save({ session });

    // -----------------------
    // 12. Commit the Transaction
    // -----------------------
});
    // -----------------------
    // 13. Respond to Client

  res.status(201).json({
    message: 'Billing data saved successfully',
    billingData,
  });
  
  } catch (error) {
    res.status(500).json({
      message: error.message,
      error: 'Error Saving Billing Data',
    });
  }finally{
      await session.endSession();
  }
});



// =========================
// Route: Edit Billing Entry
// =========================
// routes/billing.js -- replace the existing /edit/:id handler
billingRouter.post('/edit/:id', async (req, res) => {
  const billingId = req.params.id.trim();
  const session = await mongoose.startSession();

  /**────────────────────────────────────────────────────────
   *  tiny helpers
   *────────────────────────────────────────────────────────*/
  const badRequest = (msg) => {
    const err = new Error(msg);
    err.status = 400;
    throw err;
  };

  const notFound = (msg) => {
    const err = new Error(msg);
    err.status = 404;
    throw err;
  };

  const num = (v, def = 0) => {
    const n = parseFloat(v);
    return isNaN(n) ? def : n;
  };

  /**────────────────────────────────────────────────────────
   *  begin atomic work
   *────────────────────────────────────────────────────────*/
  try {

  await session.withTransaction(async () => {

      /* === 1. Extract & validate payload  === */
      const {
        invoiceNo,
        invoiceDate,
        salesmanName,
        expectedDeliveryDate,
        billingAmount,
        grandTotal,
        customerName,
        customerAddress,
        products,
        discount          = 0,
        unloading         = 0,
        transportation    = 0,
        handlingcharge    = 0,
        remark,
        customerId,
        paymentStatus,
        deliveryStatus,
        customerContactNumber,
        paymentAmount,
        paymentMethod,
        paymentReceivedDate,
        marketedBy,
        roundOff,
        roundOffMode,
        userId,
        showroom,
        salesmanPhoneNumber,
        isneededToPurchase
      } = req.body;

      const required = [
        invoiceNo, invoiceDate, salesmanName,
        expectedDeliveryDate, billingAmount,
        customerName, customerAddress,
        customerContactNumber, customerId, products
      ];
      if (required.some((f) => !f)) {
        badRequest('Missing required fields.');
      }
      if (!Array.isArray(products) || products.length === 0) {
        badRequest('`products` must be a non-empty array.');
      }

      /* === 2. Fetch DB docs needed for the edit === */
      const [
        existingBilling,
        userPerformingOp
      ] = await Promise.all([
        Billing.findById(billingId).session(session),
        User.findById(userId).session(session)
      ]);

      if (!existingBilling) notFound('Billing record not found.');
      if (!userPerformingOp) notFound('User not found.');

      const isAdmin       = !!userPerformingOp.isAdmin;
      const isBillApproved= !!existingBilling.isApproved;

      /* === 3. Build product maps once, up front === */
      const updatedProductIds = products.map(p => p.item_id.trim());
      const productDocs       = await Product
        .find({ item_id: { $in: updatedProductIds } })
        .session(session);
      const productMap = Object.fromEntries(
        productDocs.map(p => [p.item_id, p])
      );

      /* === 4. Remove products no longer in the bill === */
      const removed = existingBilling.products.filter(
        p => !updatedProductIds.includes(p.item_id)
      );
      for (const prod of removed) {
        const dbProd = productMap[prod.item_id] ||
        await Product.findOne({ item_id: prod.item_id }).session(session);
        if (dbProd && isBillApproved && isAdmin) {
          dbProd.countInStock += num(prod.quantity);
          await dbProd.save({ session });

          await StockRegistry.create([{
            date: new Date(),
            updatedBy: userPerformingOp.name,
            itemId: prod.item_id,
            name: dbProd.name,
            brand: dbProd.brand,
            category: dbProd.category,
            changeType: 'Sales (Billing reversal)',
            invoiceNo: invoiceNo.trim(),
            quantityChange: num(prod.quantity),
            finalStock: dbProd.countInStock
          }], { session });
        }
      }
      // Pull removed from embedded array
      existingBilling.products = existingBilling.products
        .filter(p => updatedProductIds.includes(p.item_id));

      /* === 5. Upsert existing + new products === */
      for (const p of products) {
        const {
          item_id, quantity, sellingPrice,
          enteredQty, sellingPriceinQty,
          selledPrice, unit, length, breadth,
          psRatio, size, gstRate, itemRemark,
          name, category, brand
        } = p;
        const idTrim   = item_id.trim();
        const newQty   = num(quantity);

        const dbProd   = productMap[idTrim];
        if (!dbProd) notFound(`Product ${idTrim} not found.`);

        const billingProd = existingBilling.products
          .find(q => q.item_id === idTrim);

        // ── EXISTING product in bill ──────────────────
        if (billingProd) {
          const qtyDiff = newQty - num(billingProd.quantity);
          if (isBillApproved && isAdmin) {
            if (dbProd.countInStock < qtyDiff * -1) {
              badRequest(`Insufficient stock for ${idTrim}.`);
            }
            dbProd.countInStock -= qtyDiff;
            await dbProd.save({ session });

            await StockRegistry.create([{
              date: new Date(),
              updatedBy: userPerformingOp.name,
              itemId: idTrim,
              name: dbProd.name,
              brand: dbProd.brand,
              category: dbProd.category,
              changeType: 'Sales (Billing edit)',
              invoiceNo: invoiceNo.trim(),
              quantityChange: -qtyDiff,
              finalStock: dbProd.countInStock
            }], { session });
          }
          billingProd.set({
            quantity: newQty,
            sellingPrice: num(sellingPrice),
            enteredQty: num(enteredQty),
            sellingPriceinQty: num(sellingPriceinQty),
            selledPrice: num(selledPrice),
            unit: unit || billingProd.unit,
            length: num(length),
            breadth: num(breadth),
            psRatio: num(psRatio),
            size: size || dbProd.size,
            gstRate: num(gstRate),
            itemRemark
          });

        // ── NEW product in bill ──────────────────────
        } else {
          if (isBillApproved && isAdmin && dbProd.countInStock < newQty) {
            badRequest(`Insufficient stock for ${idTrim}.`);
          }
          if (isBillApproved && isAdmin) {
            dbProd.countInStock -= newQty;
            await dbProd.save({ session });

            await StockRegistry.create([{
              date: new Date(),
              updatedBy: userPerformingOp.name,
              itemId: idTrim,
              name: dbProd.name,
              brand: dbProd.brand,
              category: dbProd.category,
              changeType: 'Sales (Billing)',
              invoiceNo: invoiceNo.trim(),
              quantityChange: -newQty,
              finalStock: dbProd.countInStock
            }], { session });
          }

          existingBilling.products.push({
            item_id: idTrim,
            name: name || dbProd.name,
            sellingPrice: num(sellingPrice),
            quantity: newQty,
            category: category || dbProd.category,
            brand: brand || dbProd.brand,
            unit: unit || dbProd.unit,
            sellingPriceinQty: num(sellingPriceinQty),
            selledPrice: num(selledPrice),
            enteredQty: num(enteredQty),
            length: num(length),
            breadth: num(breadth),
            psRatio: num(psRatio),
            size: dbProd.size || size,
            gstRate: num(gstRate),
            itemRemark
          });
        }
      }
      existingBilling.markModified('products');


// === 5.1 Track neededToPurchase items (optimized logic) ===
// === 5.1 Sync neededToPurchase ===
{
  // 5.1a: Remove any deleted products from both Billing and NeedToPurchase
  const removedIds = removed.map(p => p.item_id.trim());
  if (Array.isArray(existingBilling.neededToPurchase)) {
    existingBilling.neededToPurchase = existingBilling.neededToPurchase
      .filter(r => !removedIds.includes(r.item_id));
  }
  await NeedToPurchase.deleteMany({ item_id: { $in: removedIds } }).session(session);

  // 5.1b: For each product on the updated bill, upsert based on stock
  for (const p of products) {
    const idTrim     = p.item_id.trim();
    const orderedQty = num(p.quantity);
    const dbProd     = productMap[idTrim];
    const inStock    = dbProd.countInStock;
    const neededQty  = Math.max(0, orderedQty - inStock);

    //  • If no stock deficit, remove any existing NeedToPurchase entry
    if (neededQty === 0) {
      await NeedToPurchase.deleteMany({ item_id: idTrim }).session(session);
      existingBilling.neededToPurchase = (existingBilling.neededToPurchase || [])
        .filter(r => r.item_id !== idTrim);
      continue;
    }

    //  • Upsert into existingBilling.neededToPurchase
    let billEntry = (existingBilling.neededToPurchase || []).find(r => r.item_id === idTrim);
    if (billEntry) {
      billEntry.quantityOrdered = orderedQty;
      billEntry.quantityNeeded  = neededQty;
    } else {
      billEntry = {
        item_id:         idTrim,
        name:            dbProd.name,
        quantityOrdered: orderedQty,
        quantityNeeded:  neededQty,
        salesmanName: salesmanName,
        purchased:       false,
        verified:        false,
        purchaseId:      null
      };
      existingBilling.neededToPurchase = [
        ...(existingBilling.neededToPurchase || []),
        billEntry
      ];
    }

    //  • Upsert into NeedToPurchase collection
    await NeedToPurchase.findOneAndUpdate(
      { item_id: idTrim },
      {
        $set: {
          name:            dbProd.name,
          quantity:        orderedQty,
          quantityNeeded:  neededQty,
          requestedBy:     customerName.trim(),
          invoiceNo:       invoiceNo.trim(),
          purchased:       false,
          verified:        false,
          purchaseId:      null,
          salesmanName: salesmanName
        }
      },
      { upsert: true, session }
    );
  }

  // 5.1c: Flag if any neededToPurchase remains
  existingBilling.isneededToPurchase = 
    Array.isArray(existingBilling.neededToPurchase) &&
    existingBilling.neededToPurchase.length > 0;
}


      /* === 6. Customer account handling === */
      const oldCustomerId = existingBilling.customerId;
      const newCustId     = customerId.trim();
      const custChanged   = oldCustomerId !== newCustId;

      let customerAccount = await CustomerAccount
        .findOne({ customerId: newCustId })
        .session(session);

      if (!customerAccount) {
        customerAccount = new CustomerAccount({
          customerId: newCustId,
          customerName: customerName.trim(),
          customerAddress: customerAddress.trim(),
          customerContactNumber: customerContactNumber.trim(),
          bills: [],
          payments: []
        });
      } else {
        customerAccount.set({
          customerName: customerName.trim(),
          customerAddress: customerAddress.trim(),
          customerContactNumber: customerContactNumber.trim()
        });
      }

      // Upsert bill entry inside customer
      const customerBill = customerAccount.bills
        .find(b => b.invoiceNo === invoiceNo.trim());
      if (customerBill) {
        customerBill.set({
          billAmount: num(grandTotal),
          invoiceDate: new Date(invoiceDate),
          deliveryStatus
        });
      } else {
        customerAccount.bills.push({
          invoiceNo: invoiceNo.trim(),
          billAmount: num(grandTotal),
          invoiceDate: new Date(invoiceDate),
          deliveryStatus
        });
      }
      customerAccount.markModified('bills');

      /* --- move bills/payments if customer changed --- */
      if (custChanged) {
        const oldAccount = await CustomerAccount
          .findOne({ customerId: oldCustomerId })
          .session(session);
        if (oldAccount) {
          oldAccount.bills    = oldAccount.bills
            .filter(b => b.invoiceNo !== invoiceNo.trim());
          oldAccount.payments = oldAccount.payments
            .filter(p => p.invoiceNo !== invoiceNo.trim());

          await oldAccount.save({ session });
        }
      }

      /* === 7. Payment handling === */
      if (paymentAmount && paymentMethod) {
        const payAmt    = num(paymentAmount);
        if (payAmt <= 0) badRequest('Invalid payment amount.');

        const outstanding = num(grandTotal) - num(existingBilling.billingAmountReceived);
        if (payAmt > outstanding) {
          badRequest(`Only ${outstanding.toFixed(2)} is outstanding; payment exceeds balance.`);
        }

        const paymentRef = 'PAY' + Date.now();
        const payDate    = paymentReceivedDate
          ? new Date(paymentReceivedDate)
          : new Date();

        // push into billing
        existingBilling.payments.push({
          amount: payAmt,
          method: paymentMethod.trim(),
          date:   payDate,
          referenceId: paymentRef,
          invoiceNo: invoiceNo.trim()
        });
        existingBilling.billingAmountReceived =
          num(existingBilling.billingAmountReceived) + payAmt;
        existingBilling.paymentStatus =
          existingBilling.billingAmountReceived >= num(grandTotal)
            ? 'PAID' : 'PARTIAL';

        // push into customer account
        customerAccount.payments.push({
          amount: payAmt,
          method: paymentMethod.trim(),
          remark: `Bill ${invoiceNo.trim()}`,
          submittedBy: userId,
          date:   payDate,
          referenceId: paymentRef,
          invoiceNo: invoiceNo.trim()
        });
        customerAccount.markModified('payments');

        // push into PaymentsAccount + adjust balance
        const payAcc = await PaymentsAccount
          .findOne({ accountId: paymentMethod.trim() })
          .session(session);
        if (!payAcc) notFound('Payment account not found.');

        payAcc.paymentsIn.push({
          amount: payAmt,
          method: paymentMethod.trim(),
          remark: `Bill ${invoiceNo.trim()}`,
          submittedBy: userId,
          date:   payDate,
          referenceId: paymentRef
        });
        payAcc.currentBalance = num(payAcc.currentBalance) + payAmt;
        payAcc.markModified('paymentsIn');
        await payAcc.save({ session });
      }

      /* === 8. Update misc billing fields === */
      existingBilling.set({
        invoiceNo: invoiceNo.trim(),
        invoiceDate: new Date(invoiceDate),
        customerName: customerAccount.customerName,
        customerAddress: customerAccount.customerAddress,
        customerContactNumber: customerAccount.customerContactNumber,
        salesmanName: salesmanName.trim(),
        expectedDeliveryDate: new Date(expectedDeliveryDate),
        billingAmount: num(billingAmount),
        grandTotal:    num(grandTotal),
        discount:      num(discount),
        showroom,
        unloading:     num(unloading),
        transportation:num(transportation),
        handlingCharge:num(handlingcharge),
        remark:        remark?.trim() || existingBilling.remark,
        marketedBy:    marketedBy?.trim() || existingBilling.marketedBy,
        paymentStatus: paymentStatus || existingBilling.paymentStatus,
        deliveryStatus,
        salesmanPhoneNumber: salesmanPhoneNumber.trim(),
        roundOff: num(roundOff),
        roundOffMode,
        isneededToPurchase: !!isneededToPurchase
      });

      /* === 9. Keep salesman phone up to date === */
      const salesmanUser = await User
        .findOne({ name: salesmanName.trim() })
        .session(session);

      if (!salesmanUser) notFound('Salesman user not found.');
      salesmanUser.contactNumber = salesmanPhoneNumber.trim();
      await salesmanUser.save({ session });

      /* === 10. Persist everything === */
      await Promise.all([
        existingBilling.save({ session }),
        customerAccount.save({ session })
      ]);
    });

    /***** COMMIT SUCCESS *****/
    res.status(200).json({
      message: 'Billing data updated successfully.',
    });


  } catch (err) {
    res.status(err.status || 500).json({
      message: err.message || 'Error updating billing data'
    });

  } finally {
    await session.endSession();
  }
});








// =========================
// Route: Delete Billing Entry
// =========================
billingRouter.delete('/billings/delete/:id', async (req, res) => {
  // Start a MongoDB session for transaction
  const session = await mongoose.startSession();

  try {
      await session.withTransaction(async () => {
    const billingId = req.params.id;

    // === 1. Authenticate and Authorize User ===
    const { userId } = req.query;

    if (!userId) {
      throw new Error('User ID is required for authorization.');
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found.');
    }

    const isAdmin = user.isAdmin;
    if (!isAdmin) {
        throw new Error('Unauthorized. Admin privileges required.');
    }

    // === 2. Fetch the Billing Record ===
    const billing = await Billing.findById(billingId).session(session);
    
    if (!billing) {
      throw new Error('Billing record not found.');
    }

    const {
      customerId,
      invoiceNo,
      payments, // Array of payment objects
      products, // Array of product objects
      isApproved,
    } = billing;

    // === 3. Fetch the Customer Account ===
    const customerAccount = await CustomerAccount.findOne({
      customerId: customerId.trim(),
    }).session(session);

    if (customerAccount) {
      // === 4. Remove the Billing from Customer's Bills ===
      const billIndex = customerAccount.bills.findIndex(
        (bill) => bill.invoiceNo === invoiceNo.trim()
      );
      if (billIndex !== -1) {
        customerAccount.bills.splice(billIndex, 1);
      }

      // === 5. Handle Associated Payments ===
      if (payments && payments.length > 0) {
        for (const payment of payments) {
          const { amount, method, date, submittedBy, referenceId } = payment;

          // a. Remove Payment from PaymentsAccount
          const paymentsAccount = await PaymentsAccount.findOne({
            accountId: method.trim(),
          }).session(session);
          if (paymentsAccount) {
            const paymentIndex = paymentsAccount.paymentsIn.findIndex(
              (p) =>
                p.referenceId === referenceId &&
                p.amount === amount &&
                p.submittedBy === submittedBy &&
                new Date(p.date).getTime() === new Date(date).getTime()
            );

            if (paymentIndex !== -1) {
              paymentsAccount.paymentsIn.splice(paymentIndex, 1);
              await paymentsAccount.save({ session });
            }
          }

          // b. Remove Payment from CustomerAccount's Payments
          const customerPaymentIndex = customerAccount.payments.findIndex(
            (p) => p.referenceId === referenceId
          );

          if (customerPaymentIndex !== -1) {
            customerAccount.payments.splice(customerPaymentIndex, 1);
          }
        }
      }
    }

    // === 6. Restore Product Stock ===
    if (products && products.length > 0) {
      for (const item of products) {
        const { item_id, quantity } = item;

        if (!item_id || isNaN(quantity) || quantity <= 0) {
          throw new Error('Invalid product details in billing.');
        }

        const product = await Product.findOne({
          item_id: item_id.trim(),
        }).session(session);

        if (product) {
          if (isApproved || isAdmin) {
            const restoredQuantity = parseFloat(quantity);
            product.countInStock += restoredQuantity;

            // --- 📌 Add StockRegistry Entry ---
            const stockEntry = new StockRegistry({
              date: new Date(),
              updatedBy: user.name, // Admin or authorized user
              itemId: product.item_id,
              name: product.name,
              brand: product.brand,
              category: product.category,
              changeType: 'Sales Billing (Delete)',
              invoiceNo: invoiceNo,
              quantityChange: restoredQuantity,
              finalStock: product.countInStock,
            });

            await stockEntry.save({ session });

            await product.save({ session });
          }
        } else {
            throw new Error(`Product with ID ${item_id.trim()} not found.`);
        }
      }
    }

    // === 7. Remove the Billing Entry ===
    const deletedBill = await Billing.findOneAndDelete({ _id: billingId }).session(session);

    if (customerAccount) {
      // === 8. Save the Updated Customer Account ===
      await customerAccount.save({ session });
    }
      
    // === 9. Commit the Transaction ===
   });

    // === 10. Respond to the Client ===
    res.status(200).json({ message: 'Billing record deleted successfully.' });
  } catch (error) {
    console.log('Error deleting billing record:', error);
    res.status(500).json({
      message: 'Error deleting billing record.',
      error: error.message,
    });
  }finally{
    await session.endSession();
  }
});






// =========================
// Route: Approve Billing Entry
// =========================
billingRouter.put('/bill/approve/:billId', async (req, res) => {
  const session = await mongoose.startSession();

  try {
      await session.withTransaction(async () => {
    const { billId } = req.params;
    const { userId } = req.body;

    const approvingUser = await User.findById(userId).session(session);
    if (!approvingUser) {
      throw new Error('Approving user not found')
    }

    if (!approvingUser.isAdmin) {
      throw new Error('Only admins can approve bills'); 
    }

    const existingBill = await Billing.findById(billId).session(session);
    if (!existingBill) {
      throw new Error('Bill Not Found');
    }

    if (existingBill.isApproved) {
      throw new Error('Bill Is Already Approved');
    }

    const outOfStockItems = [];
    const productMap = new Map();

    // Step 1: Validate all products
    for (const item of existingBill.products) {
      const { item_id, quantity } = item;
      const product = await Product.findOne({ item_id }).session(session);

      if (!product) {
        throw new Error( `Product with ID ${item_id} not found` );
      }

      if (product.countInStock < quantity) {
        outOfStockItems.push({
          name: product.name,
          item_id: product.item_id,
          available: product.countInStock,
          requested: quantity,
        });
      }

      productMap.set(item_id, product);
    }

    // Step 2: If any item is out of stock, return detailed error
    if (outOfStockItems.length > 0) {
      throw Object.assign(
        new Error('Some Products are Out of Stock'),
        {outOfStock: outOfStockItems}
      )
    }

    // Step 3: Proceed with approval and stock update
    const stockRegistryEntries = [];

    for (const item of existingBill.products) {
      const { item_id, quantity } = item;
      const product = productMap.get(item_id);

      product.countInStock -= parseFloat(quantity);
      await product.save({ session });

      stockRegistryEntries.push({
        updatedBy: approvingUser.name,
        itemId: product.item_id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        changeType: 'Sales (Billing)',
        invoiceNo: existingBill.invoiceNo,
        quantityChange: -parseFloat(quantity),
        finalStock: product.countInStock,
      });
    }

    await StockRegistry.insertMany(stockRegistryEntries, { session });

    existingBill.isApproved = true;
    existingBill.approvedBy = userId;
    await existingBill.save({ session });

  });

    res.status(200).json({ message: 'Bill approved successfully' });

  } catch (error) {
    if(error.outOfStock){
      res.status(500).json({ error: error.message, outOfStock: error.outOfStock  });
    }else{
      res.status(500).json({ error: 'Internal server error', details: error.message  });
    }
  } finally {
      await session.endSession();
  }
});




// Get all billings
billingRouter.get('/', async (req, res) => {
    try {
      // Fetch and sort billing records by createdAt field in descending order (newest first)
      const billings = await Billing.find().sort({ createdAt: -1 });
  
      if (!billings) {
        return res.status(404).json({ message: 'No billings found' });
      }
      res.status(200).json(billings);
    } catch (error) {
      console.error('Error fetching billings:', error);
      res.status(500).json({ message: 'Error fetching billings', error: error.message });
    }
});


// routes/billingRouter.js
billingRouter.get('/list/pagenated', async (req, res) => {
  try {
    // ── query params ─────────────────────────────────────────────
    const {
      page = 1,
      limit = 15,

      search = '',
      invoiceStartDate,
      invoiceEndDate,
      deliveryStartDate,
      deliveryEndDate,
      status = 'All',

      // sent by the front-end so we can reuse the same route
      userId,
      isAdmin,
    } = req.query;

    const skip = (+page - 1) * +limit;

    // ── build the Mongo filter object exactly once ───────────────
    const q = {};

    // non-admin users: only their un-approved bills
    if (!JSON.parse(isAdmin) && userId) {
      q.submittedBy = userId;
      q.isApproved  = false;
    }

    // free-text search
    if (search) {
      const r = new RegExp(search, 'i');
      q.$or = [
        { invoiceNo: r },
        { customerName: r },
        { salesmanName: r },
        { marketedBy: r },
        { showroom: r },
      ];
    }

    // date filters
    const dateRange = (field, start, end) => {
      if (start || end) {
        q[field] = {};
        if (start) q[field].$gte = new Date(start);
        if (end)   q[field].$lte = new Date(end);
      }
    };

    dateRange('invoiceDate',        invoiceStartDate,  invoiceEndDate);
    dateRange('expectedDeliveryDate', deliveryStartDate, deliveryEndDate);

    // status filter
    switch (status) {
      case 'Paid':
        q.paymentStatus = 'Paid';
        break;
      case 'Pending':
        q.paymentStatus = { $ne: 'Paid' };
        q.isApproved    = true;
        break;
      case 'Unapproved':
        q.isApproved = false;
        break;
      case 'Need to Purchase':
        q.neededToPurchase = {
          $elemMatch: {
            $or: [ { purchased: false }, { verified: false } ],
          },
        };
        break;
      // 'All' → no extra filter
    }

    // ── run the 3 queries in parallel ────────────────────────────
    const [billings, totalCount, statsRaw] = await Promise.all([
      Billing.find(q)
             .sort({ createdAt: -1 })
             .skip(skip)
             .limit(+limit),

      Billing.countDocuments(q),

      // lightweight aggregate for the header cards
Billing.aggregate([
  { $match: q },
  {
    $project: {
      grandTotal: 1,
      billingAmount: 1,
      billingAmountReceived: 1,
      paymentStatus: 1,
      products: 1,
      totalFuelCharge: {
        $toDouble: "$totalFuelCharge"
      },
      otherExpenses: 1,
      deliveries: 1
    }
  },
  {
    $addFields: {
      totalOtherExpense: {
        $sum: [
          { $sum: "$otherExpenses.amount" },
          {
            $sum: {
              $map: {
                input: "$deliveries",
                as: "d",
                in: {
                  $sum: [
                    { $sum: "$$d.otherExpenses.amount" },
                    { $toDouble: "$$d.bata" }
                  ]
                }
              }
            }
          }
        ]
      },
      totalRevenue: {
        $sum: {
          $map: {
            input: "$products",
            as: "p",
            in: {
              $multiply: [
                "$$p.quantity",
                { $toDouble: "$$p.selledPrice" }
              ]
            }
          }
        }
      }
    }
  },
  {
  $lookup: {
    from: 'products',
    localField: 'products.item_id',
    foreignField: 'item_id',
    as: 'productCosts'
  }
},
{
  $addFields: {
    totalCost: {
      $sum: {
        $map: {
          input: "$products",
          as: "p",
          in: {
            $let: {
              vars: {
                matchingCost: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$productCosts",
                        as: "pc",
                        cond: { $eq: ["$$pc.item_id", "$$p.item_id"] }
                      }
                    },
                    0
                  ]
                }
              },
              in: {
                $multiply: [
                  "$$p.quantity",
                  { $toDouble: "$$matchingCost.price" }
                ]
              }
            }
          }
        }
      }
    }
  }
},
  {
    $group: {
      _id: null,
      totalInvoices: { $sum: 1 },
      totalRevenue: { $sum: "$totalRevenue" },
      totalOtherExpense: { $sum: "$totalOtherExpense" },
      totalFuelCharge: { $sum: "$totalFuelCharge" },
      totalCost: { $sum: "$totalCost" },
      totalPending: {
        $sum: {
          $cond: [
            { $eq: ["$paymentStatus", "Paid"] },
            0,
            { $subtract: ["$billingAmount", "$billingAmountReceived"] }
          ]
        }
      }
    }
  }
])

    ]);

    res.json({
      billings,
      totalCount,
      stats: statsRaw[0] || { totalInvoices: 0, totalRevenue: 0, totalPending: 0 , totalCost: 0},
    });

  } catch (err) {
    console.error('Error fetching billings:', err);
    res.status(500).json({ message: 'Error fetching billings', error: err.message });
  }
});

  


billingRouter.get('/driver/', async (req, res) => {
  const page = parseFloat(req.query.page) || 1; // Default to page 1
  const limit = parseFloat(req.query.limit) || 3; // Default to 10 items per page

  try {
    const totalBillings = await Billing.find({ deliveryStatus: 'Pending', isApproved: {$eq: true}  }).countDocuments(); // Get total billing count
    
    const billings = await Billing.find({ deliveryStatus: 'Pending' , isApproved: {$eq: true}  }) // Filter by deliveryStatus
    .sort({ invoiceNo: -1 }) // Sort by invoiceNo in descending order // Skip documents for pagination
    .limit(limit); // Limit to 'limit' number of documents
  

    res.json({
      billings,
      totalPages: Math.ceil(totalBillings / limit),
      currentPage: page,
      totalbilling: totalBillings
    });
  } catch (error) {
    console.error("Error fetching billings:", error);
    res.status(500).json({ message: "Error fetching billings" });
  }
});


billingRouter.get('/product/get-sold-out/:id', async (req, res) => {
  const itemId = req.params.id.trim();

  try {
    const totalQuantity = await Billing.getTotalQuantitySold(itemId);

    // Always return a result, even if no sales are found
    res.status(200).json({ itemId, totalQuantity });
  } catch (error) {
    console.error("Error occurred while fetching total quantity sold:", error);
    res.status(500).json({ message: "An error occurred while fetching the data.", error: error.message });
  }
});




// Get a billing by ID
billingRouter.get('/:id', async (req, res) => {
  try {
    const billing = await Billing.findById(req.params.id);
    if (!billing) {
      return res.status(500).json({ message: 'Billing not found' });
    }
    res.status(200).json(billing);
  } catch (error) {
    console.error('Error fetching billing:', error);
    res.status(500).json({ message: 'Error fetching billing', error });
  }
});


billingRouter.get('/getinvoice/:id', async (req, res) => {
  try {
    const billing = await Billing.findOne({invoiceNo: req.params.id});
    if (!billing) {
      console.log("not found")
      return res.status(500).json({ message: 'Billing not found' });
    }
    res.status(200).json(billing);
  } catch (error) {
    console.error('Error fetching billing:', error);
    res.status(500).json({ message: 'Error fetching billing', error });
  }
});


// Fetch all billing numbers
billingRouter.get('/numbers/getBillings', async (req, res) => {
  try {
    const billings = await Billing.find({}, { invoiceNo: 1 }); // Fetch only billingNo
    res.status(200).json(billings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching billing numbers', error });
  }
});


billingRouter.put("/driver/billings/:id", async (req, res) => {
  const { deliveryStatus, paymentStatus } = req.body;
  try {
    const updatedBilling = await Billing.findByIdAndUpdate(
      req.params.id,
      { deliveryStatus, paymentStatus },
      { new: true }
    );
    res.status(200).json(updatedBilling);
  } catch (error) {
    res.status(500).json({ message: "Error updating billing", error });
  }
});

// Route to fetch a limited number of low-stock products (e.g., for homepage)
billingRouter.get('/deliveries/expected-delivery', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set the time to the start of today (00:00:00)

    const billings = await Billing.find({expectedDeliveryDate: { $gte: today },deliveryStatus: { $ne: 'Delivered' }, isApproved: { $eq: true  } }).sort({ expectedDeliveryDate: 1 }).limit(1); // Limit to 3 products
    
    // console.log(billings)
    res.json(billings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});

billingRouter.get('/alldelivery/all', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set the time to the start of today (00:00:00)
    const billings = await Billing.find({expectedDeliveryDate: {$gte: today}, deliveryStatus: { $ne: 'Delivered' }, isApproved: { $eq: true}}).sort({ expectedDeliveryDate: 1 }) // Limit to 3 products
    // console.log(billings)
    res.json(billings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});


billingRouter.get("/billing/suggestions", async (req, res) => {
  try {
    let { search = "" } = req.query;
    search = search.replace(/\s+/g, "").toUpperCase(); // Normalize the search term

    // Search both `invoiceNo` and `customerName` fields with case insensitive regex
    const suggestions = await Billing.find({
      $or: [
        { invoiceNo: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } }
      ]
    }).sort({ invoiceNo: -1 }).collation({ locale: "en", numericOrdering: true }).limit(5); // Limit suggestions to 5

    res.status(200).json(suggestions);
  } catch (error) {
    console.error("Error fetching suggestions:", error); // Log the error for debugging
    res.status(500).json({ message: "Error fetching suggestions" });
  }
});


billingRouter.get("/billing/driver/suggestions", async (req, res) => {
  try {
    let { search = "" } = req.query;
    search = search.replace(/\s+/g, "").toUpperCase(); // Normalize the search term

    // Fetch suggestions based on the search term and delivery status
    const suggestions = await Billing.find({
      $and: [
        {
          $or: [
            { invoiceNo: { $regex: search, $options: "i" } },
            { customerName: { $regex: search, $options: "i" } },
          ]
        },
        { deliveryStatus: { $nin: ["Delivered"] } }, // Exclude 'Delivered' status
      ]
    })
      .sort({ invoiceNo: -1 })
      .collation({ locale: "en", numericOrdering: true })
      .limit(5); // Limit suggestions to 5


    res.status(200).json(suggestions); // Send the filtered suggestions
  } catch (error) {
    console.error("Error fetching suggestions:", error); // Log errors for debugging
    res.status(500).json({ message: "Error fetching suggestions" });
  }
});




billingRouter.get('/lastOrder/id', async (req, res) => {
  try {
    // Execute both queries concurrently for better performance.
    const [billing, customers] = await Promise.all([
      Billing.findOne({ invoiceNo: /^KK\d+$/ })
        .sort({ invoiceNo: -1 })
        .collation({ locale: "en", numericOrdering: true }),
      CustomerAccount.aggregate([
        {
          $addFields: {
            numericId: {
              $convert: {
                input: {
                  $cond: {
                    if: { $regexMatch: { input: "$customerId", regex: /^CUS\d+$/ } },
                    then: { $substr: ["$customerId", 3, -15] },
                    else: "0"
                  }
                },
                to: "long",   // Convert to a 64-bit integer
                onError: 0,   // In case of conversion errors, default to 0
                onNull: 0     // If the input is null, default to 0
              }
            }
          }
        },
        { $sort: { numericId: -1 } },
        { $limit: 1 }
      ])
    ]);

    // Use optional chaining to safely access the invoice and customerId fields.
    const lastInvoice = billing?.invoiceNo || 'KK0';
    const lastCustomerId = (customers.length > 0 && customers[0].customerId) || 'CUS0';

    return res.json({ lastInvoice, lastCustomerId });
  } catch (error) {
    console.error('Error fetching last order details:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});







billingRouter.post("/billing/:id/addExpenses", async (req, res) => {
  const session = await mongoose.startSession();
  try {
      await session.withTransaction(async () => {
    const { id } = req.params;
    const { otherExpenses = [], paymentMethod, userId } = req.body;

    // Find the billing document by ID
    const billing = await Billing.findById(id);
    if (!billing) {
      throw new Error("Billing not found");
    }

    // Validate and filter otherExpenses to include only entries with a positive amount
    const validOtherExpenses = Array.isArray(otherExpenses)
      ? otherExpenses.filter(expense =>
          typeof expense === "object" &&
          expense !== null &&
          typeof expense.amount === "number" &&
          expense.amount > 0
        )
      : [];

    if (validOtherExpenses.length === 0) {
      throw new Error("No valid expenses provided.");
    }

    const expReference = "EXP" + Date.now().toString();

    // Append valid otherExpenses to the billing document
    billing.otherExpenses.push(
      ...validOtherExpenses.map(expense => ({
        amount: parseFloat(expense.amount),
        remark: expense.remark || "",
        method: paymentMethod,
        date: new Date(),
        referenceId: expReference,
      }))
    );

    try {
      const account = await PaymentsAccount.findOne({ accountId: paymentMethod });

      if (!account) {
        console.log(`No account found for accountId: ${paymentMethod}`);
        throw new Error("Payment account not found");
      }

      // Generate a unique referenceId for these expenses
      // You can create a separate referenceId for each expense, or one for all.
      // Here, we'll generate one for each expense to keep them distinct.
      const expensePayments = validOtherExpenses.map(expense => ({
        amount: parseFloat(expense.amount),
        remark: `Other Expense For Bill ${billing.invoiceNo}: ${expense.remark}`,
        method: paymentMethod,
        submittedBy: userId,
        date: new Date(),
        referenceId: expReference,
      }));

      account.paymentsOut.push(...expensePayments);

      await account.save({session});
    } catch (error) {
      console.log("Error processing payment:", error);
      throw new Error("Error processing payment", error);
    }

    // Save the updated document
    await billing.save({session});

  });

    res.status(200).json({ message: "Expenses added successfully" });
  } catch (error) {
    console.error("Error adding expenses:", error);
    res.status(500).json({ message: "Error adding expenses" });
  }finally{
    await session.endSession();
  }
});


// DELETE function for other expenses
// DELETE function for other expenses
billingRouter.delete("/billing/:id/deleteExpense/:expenseId", async (req, res) => {
  const session = await mongoose.startSession();
  try {
      await session.withTransaction(async () => {
    const { id, expenseId } = req.params;

    // Find the billing document by ID
    const billing = await Billing.findById(id);
    if (!billing) {
      throw new Error("Billing not found");
    }

    // Find and remove the expense by its _id
    const expenseIndex = billing.otherExpenses.findIndex(
      (expense) => expense._id.toString() === expenseId
    );

    if (expenseIndex === -1) {
      throw new Error("Expense not found");
    }

    const [removedExpense] = billing.otherExpenses.splice(expenseIndex, 1);

    try {
      const referenceId = removedExpense.referenceId;

      const account = await PaymentsAccount.findOne({ accountId: removedExpense.method });

      if (!account) {
        console.log(`No account found for accountId: ${removedExpense.method}`);
        throw new Error("Payment account not found");
      }

      // Remove the corresponding payment from the account's paymentsOut based on the referenceId
      const paymentIndex = account.paymentsOut.findIndex(
        (payment) => payment.referenceId === referenceId
      );

      if (paymentIndex !== -1) {
        account.paymentsOut.splice(paymentIndex, 1);
        await account.save({session});
      }
    } catch (error) {
      console.error("Error updating payment account:", error);
      return res.status(500).json({ message: "Error updating payment account" });
    }

    // Save the updated billing document
    await billing.save({session});
      });
    res.status(200).json({ message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ message: "Error deleting expense" });
  }finally{
    await session.endSession();
  }
});






billingRouter.get('/summary/monthly-sales', async (req, res) => {
  try {
    const sales = await Billing.aggregate([
      {
        $group: {
          _id: { $month: '$invoiceDate' },
          totalSales: { $sum: '$billingAmount' },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    res.json(sales);
  } catch (error) {
    console.error('Error fetching monthly sales data:', error);
    res.status(500).json({ message: 'Error fetching monthly sales data' });
  }
});

// GET Total Billing Sum
billingRouter.get('/summary/total-sales', async (req, res) => {
  try {
    const totalSales = await Billing.aggregate([
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$billingAmount' },
        },
      },
    ]);

    res.json({
      totalSales: totalSales.length > 0 ? totalSales[0].totalAmount : 0,
    });
  } catch (error) {
    console.error('Error fetching total sales:', error);
    res.status(500).json({ message: 'Error fetching total sales' });
  }
});

billingRouter.get('/purchases/suggestions', async (req, res) => {
  try {
    const searchTerm = req.query.q;
    if (!searchTerm) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    // Use aggregation to group by sellerId and ensure uniqueness
    const sellers = await SupplierAccount.aggregate([
      {
        $match: {
          sellerName: { $regex: searchTerm, $options: 'i' }
        }
      },
      {
        $group: {
          _id: '$sellerId',
          sellerName: { $first: '$sellerName' },
          sellerAddress: { $first: '$sellerAddress' },
          sellerGst: { $first: '$sellerGst' },
          sellerId: { $first: '$sellerId' }
        }
      },
      {
        $limit: 10 // Limit to 10 unique suggestions for performance
      }
    ]);

    const suggestions = sellers.map(seller => ({
      sellerName: seller.sellerName,
      sellerAddress: seller.sellerAddress,
      sellerGst: seller.sellerGst,
      sellerId: seller.sellerId
    }));

    res.json({ suggestions });
  } catch (error) {
    console.error('Error fetching seller suggestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



billingRouter.get('/purchases/categories', async (req, res) => {
  try {
    // Fetch distinct categories from previous purchase bills
    const categories = await Product.distinct('category');
    res.json({categories});
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



billingRouter.get('/deliveries/all', async (req, res) => {
  try {
    const { userId, invoiceNo, driverName } = req.query;

    let query = {};
    if (invoiceNo) {
      query.invoiceNo = { $regex: invoiceNo, $options: 'i' };
    }

    if (driverName) {
      query['deliveries.driverName'] = { $regex: driverName, $options: 'i' };
    }

    if (userId) {
      query['deliveries.userId'] = { $in: Array.isArray(userId) ? userId : [userId] };
    }

    const billings = await Billing.find(query).lean();

    const deliveries = billings.flatMap(billing =>
      billing.deliveries
        .filter(delivery => !driverName || delivery.driverName === driverName)
        .map(delivery => ({
          invoiceNo: billing.invoiceNo,
          customerName: billing.customerName,
          customerAddress: billing.customerAddress,
          billingAmount: billing.billingAmount,
          paymentStatus: billing.paymentStatus,
          deliveryStatus: delivery.deliveryStatus,
          deliveryId: delivery.deliveryId,
          driverName: delivery.driverName,
          kmTravelled: delivery.kmTravelled,
          startingKm: delivery.startingKm,
          endKm: delivery.endKm,
          fuelCharge: delivery.fuelCharge,
          otherExpenses: delivery.otherExpenses,
          productsDelivered: delivery.productsDelivered,
          bata: delivery.bata,
          vehicleNumber: delivery.vehicleNumber,
        }))
    );

    res.json(deliveries);
  } catch (error) {
    console.error('Error fetching deliveries:', error);
    res.status(500).json({ message: 'Error fetching deliveries.' });
  }
});




billingRouter.get('/bill/profile',async (req,res)=>{
  try {
    const { salesmanName } = req.query;

    if (!salesmanName) {
      return res.status(400).json({ message: 'salesmanName query parameter is required' });
    }

    // Query bills that match the provided salesman name.
    // Using trim() to remove any leading/trailing spaces.
    const bills = await Billing.find({ salesmanName: salesmanName.trim() });

    return res.status(200).json(bills);
  } catch (error) {
    console.error('Error fetching bills by salesman:', error);
    return res.status(500).json({ message: 'Server error while fetching bills' });
  }
})





// DELETE /api/billing/deliveries/:deliveryId
billingRouter.delete('/deliveries/:deliveryId', async (req, res) => {
  const session = await mongoose.startSession();

  try {
      await session.withTransaction(async () => {
    const { deliveryId } = req.params;

    // 1. Validate deliveryId
    if (!deliveryId) {
      throw new Error('Delivery ID is required.');
    }

    // 2. Find the Billing document containing the delivery
    const billing = await Billing.findOne({ 'deliveries.deliveryId': deliveryId }).session(session);
    if (!billing) {
      throw new Error(`Billing document containing deliveryId '${deliveryId}' not found.`);
    }

    // 3. Find the specific delivery entry
    const delivery = billing.deliveries.find(d => d.deliveryId === deliveryId);
    if (!delivery) {
      throw new Error(`Delivery with deliveryId '${deliveryId}' not found in billing.`);
    }

    // 4. Delete the associated Location document using deliveryId
    await Location.deleteOne({ deliveryId }).session(session);

    // 5. Remove the delivery from the deliveries array and deliveryIds array
    billing.deliveries = billing.deliveries.filter(d => d.deliveryId !== deliveryId);
    billing.deliveryIds = billing.deliveryIds.filter(id => id !== deliveryId);

    // 6. Recalculate deliveredQuantity and deliveryStatus for each product based on remaining deliveries
    billing.products.forEach(product => {
      // Sum delivered quantities from all remaining deliveries for this product
      const totalDelivered = billing.deliveries.reduce((sum, del) => {
        const delProd = del.productsDelivered.find(p => p.item_id === product.item_id);
        return sum + (delProd ? delProd.deliveredQuantity : 0);
      }, 0);

      // Update deliveredQuantity
      product.deliveredQuantity = totalDelivered;

      // Update deliveryStatus based on totalDelivered
      if (totalDelivered === product.quantity) {
        product.deliveryStatus = "Delivered";
      } else if (totalDelivered > 0 && totalDelivered < product.quantity) {
        product.deliveryStatus = "Partially Delivered";
      } else {
        product.deliveryStatus = "Pending";
      }
    });

    // 7. Remove paymentsOut related to this delivery’s otherExpenses from PaymentsAccount
    const otherExpenses = delivery.otherExpenses || [];
    for (const expense of otherExpenses) {
      if (expense.method && expense.method.trim()) {
        const expenseMethod = expense.method.trim();
        const account = await PaymentsAccount.findOne({ accountId: expenseMethod }).session(session);
        if (account) {
          // Create a reference ID consistent with your otherExpense creation logic
          const expenseRefId = `EXP-${expense._id}`;
          console.log(`Reference ID to remove: ${expenseRefId}`);

          const originalPaymentsOutCount = account.paymentsOut.length;
          account.paymentsOut = account.paymentsOut.filter(
            pay => pay.referenceId !== expenseRefId
          );

          const removedPaymentsCount = originalPaymentsOutCount - account.paymentsOut.length;
          if (removedPaymentsCount > 0) {
            console.log(`Removed ${removedPaymentsCount} payment(s) related to otherExpense ID '${expense._id}' from PaymentsAccount '${expenseMethod}'.`);
          } else {
            console.log(`No matching payments found to remove for otherExpense ID '${expense._id}' in PaymentsAccount '${expenseMethod}'.`);
          }
          await account.save({ session });
        } else {
          console.warn(`PaymentsAccount with accountId '${expenseMethod}' not found. No payments removed for otherExpense ID '${expense._id}'.`);
        }
      }
    }

    // 8. Recalculate billing-level delivery status and totals
    // Assuming updateDeliveryStatus() recalculates overall delivery statuses
    await billing.updateDeliveryStatus();
    // Assuming calculateTotals() recalculates totals such as totalFuelCharge and totalOtherExpenses
    billing.calculateTotals();

    // 9. Save the updated Billing document
    await billing.save({ session });

    // 10. Commit the transaction and end the session
      });
    res.status(200).json({ message: 'Delivery deleted successfully and related data updated.' });
  } catch (error) {
    console.error('Error deleting delivery:', error);
    res.status(500).json({ message: error.message || 'Error deleting delivery.' });
  }finally{
      await session.endSession();
  }
});





// PUT /api/users/billing/update-delivery
billingRouter.put('/update-delivery/update', async (req, res) => {
  const session = await mongoose.startSession();

  try {
      await session.withTransaction(async () => {
    const {
      deliveryId,
      startingKm,
      endKm,
      fuelCharge,
      bata,
      vehicleNumber,
      method, // Payment method for other expenses (if any)
      updatedOtherExpenses = [],
      deliveredProducts = [],
      endLocation, // Assuming endLocation is needed for updating Location
    } = req.body;


    // 1. Validate required fields
    if (!deliveryId) {
      throw new Error('Delivery ID is required.');
    }

    // 2. Find the Billing document containing the delivery
    const billing = await Billing.findOne({ 'deliveries.deliveryId': deliveryId }).session(session);
    if (!billing) {
      throw new Error(`Billing with deliveryId '${deliveryId}' not found.`);
    }

    // 3. Find the specific delivery entry
    const delivery = billing.deliveries.find(d => d.deliveryId === deliveryId);
    if (!delivery) {
      throw new Error(`Delivery with deliveryId '${deliveryId}' not found in billing.`);
    }

    // 4. Update startingKm, endKm, and recalculate kmTravelled for this delivery only
    if (startingKm !== undefined) {
      const parsedStartingKm = parseFloat(startingKm);
      if (isNaN(parsedStartingKm)) {
        throw new Error("startingKm must be a valid number.");
      }
      delivery.startingKm = parsedStartingKm;
    }

    if (endKm !== undefined) {
      const parsedEndKm = parseFloat(endKm);
      if (isNaN(parsedEndKm)) {
        throw new Error("endKm must be a valid number.");
      }
      delivery.endKm = parsedEndKm;
    }

    if (!isNaN(delivery.startingKm) && !isNaN(delivery.endKm)) {
      const calculatedKmTravelled = delivery.endKm - delivery.startingKm;
      if (calculatedKmTravelled < 0) {
        throw new Error("endKm cannot be less than startingKm.");
      }
      delivery.kmTravelled = calculatedKmTravelled;
    }

    // 5. Update fuelCharge at the delivery level only
    if (fuelCharge !== undefined) {
      const parsedFuelCharge = parseFloat(fuelCharge);
      if (isNaN(parsedFuelCharge)) {
        throw new Error("fuelCharge must be a valid number.");
      }
      if (parsedFuelCharge < 0) {
        throw new Error("fuelCharge cannot be negative.");
      }
      delivery.fuelCharge = parsedFuelCharge;
    }

    if(bata !== undefined){
      const parsedBata = parseFloat(bata);
         delivery.bata = parsedBata;
    }

    delivery.vehicleNumber = vehicleNumber || delivery.vehicleNumber || '';

    // 6. Update delivered products for this delivery
    if (!Array.isArray(deliveredProducts)) {
      throw new Error("'deliveredProducts' must be an array.");
    }

    for (const dp of deliveredProducts) {
      const { item_id, deliveredQuantity } = dp;

      if (!item_id || typeof deliveredQuantity !== 'number' || deliveredQuantity < 0) {
        throw new Error("Each delivered product must have 'item_id' and a non-negative 'deliveredQuantity'.");
      }

      const product = billing.products.find(p => p.item_id === item_id);
      if (!product) {
        throw new Error(`Product with item_id '${item_id}' not found in billing.`);
      }

      // Validate deliveredQuantity does not exceed ordered quantity
      if (deliveredQuantity > product.quantity) {
        throw new Error(`Delivered quantity for product '${item_id}' exceeds the ordered amount.`);
      }

      // Update or add the deliveredQuantity in this delivery's productsDelivered
      const existingDeliveredProduct = delivery.productsDelivered.find(p => p.item_id === item_id);
      if (existingDeliveredProduct) {
        existingDeliveredProduct.deliveredQuantity = deliveredQuantity;
      } else {
        delivery.productsDelivered.push({
          item_id,
          deliveredQuantity,
          psRatio: product.psRatio || "",
        });
      }
    }

    // 7. Recalculate total delivered quantities and deliveryStatus for each product across ALL deliveries
    billing.products.forEach(product => {
      const totalDelivered = billing.deliveries.reduce((sum, del) => {
        const delProd = del.productsDelivered.find(p => p.item_id === product.item_id);
        return sum + (delProd ? delProd.deliveredQuantity : 0);
      }, 0);

      product.deliveredQuantity = totalDelivered;

      if (totalDelivered === product.quantity) {
        product.deliveryStatus = "Delivered";
      } else if (totalDelivered > 0 && totalDelivered < product.quantity) {
        product.deliveryStatus = "Partially Delivered";
      } else {
        product.deliveryStatus = "Pending";
      }
    });

    // 8. Handle updatedOtherExpenses at the delivery level
    //    Only update or add expenses; do not remove existing expenses not mentioned
 // 8. Handle updatedOtherExpenses at the delivery level
//    Only update or add expenses; if an expense’s amount is 0, remove it from the delivery.
const existingExpensesMap = new Map(delivery.otherExpenses.map(e => [e._id.toString(), e]));

for (const expense of updatedOtherExpenses) {
  const { id, amount, remark } = expense;
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    throw new Error("Expense amount must be a non-negative number.");
  }

  if (parsedAmount === 0) {
    // If amount is 0, remove the expense if it exists.
    if (id) {
      delivery.otherExpenses = delivery.otherExpenses.filter(e => e._id.toString() !== id.toString());
      existingExpensesMap.delete(id.toString());
    }
    // For a new expense (with no id) and amount 0, we do nothing.
  } else {
    if (id) {
      // Update existing expense if it exists.
      const existingExpense = existingExpensesMap.get(id.toString());
      if (existingExpense) {
        existingExpense.amount = parsedAmount;
        existingExpense.remark = remark || existingExpense.remark;
        if (method && method.trim()) {
          existingExpense.method = method.trim();
        }
      } else {
        throw new Error(`Expense with id '${id}' not found in this delivery.`);
      }
    } else {
      // Add new expense with amount greater than 0.
      const newExpenseId = new mongoose.Types.ObjectId();
      const newExpense = {
        _id: newExpenseId,
        amount: parsedAmount,
        remark: remark || "",
        date: new Date(),
        method: method && method.trim() ? method.trim() : undefined,
      };
      delivery.otherExpenses.push(newExpense);
      existingExpensesMap.set(newExpenseId.toString(), newExpense);
    }
  }
}


    // 9. Update overall billing delivery status
    await billing.updateDeliveryStatus();

    // 10. If method is provided, update PaymentsAccount for otherExpenses of this delivery
    //     Only update or add paymentsOut entries related to this delivery's otherExpenses
    if (method && method.trim()) {
      const expenseMethod = method.trim();
      const account = await PaymentsAccount.findOne({ accountId: expenseMethod }).session(session);
      if (!account) {
        throw new Error(`Payment account with accountId '${expenseMethod}' not found.`);
      }

      const currentExpenseRefIds = new Set(delivery.otherExpenses.map(exp => `EXP-${exp._id}`));

      account.paymentsOut = account.paymentsOut.filter(pay => {
        if (pay.referenceId && pay.referenceId.startsWith("EXP-")) {
          return currentExpenseRefIds.has(pay.referenceId);
        }
        return true; // keep unrelated payment entries
      });

      for (const exp of delivery.otherExpenses) {
        if (exp.amount > 0) {
          const expenseRefId = `EXP-${exp._id}`;

          // Find existing paymentOut for this expense
          const existingPayment = account.paymentsOut.find(pay => pay.referenceId === expenseRefId);

          if (existingPayment) {
            // Update existing paymentOut
            existingPayment.amount = exp.amount;
            existingPayment.method = expenseMethod;
            existingPayment.remark = `Expense (${exp.remark}) for delivery ${deliveryId}`;
            existingPayment.submittedBy = "userId" || "system";
            existingPayment.date = new Date();
          } else {
            // Add new paymentOut
            account.paymentsOut.push({
              amount: exp.amount,
              method: expenseMethod,
              referenceId: expenseRefId,
              remark: `Expense (${exp.remark}) for delivery ${deliveryId}`,
              submittedBy: "userId" || "system",
              date: new Date(),
            });
          }
        }
      }

      // Save the updated PaymentsAccount
      await account.save({ session });
    }

    // 11. Recalculate totals for billing (totalFuelCharge, totalOtherExpenses)
    billing.calculateTotals();

    // 12. Save the updated Billing document
    await billing.save({ session });

    // 13. Update Location with end location (if provided)
    if (endLocation) {
      // Assuming Location model has a reference to deliveryId
      const location = await Location.findOne({ deliveryId }).session(session);
      if (location) {
        location.endLocations.push({
          coordinates: endLocation,
          timestamp: new Date(),
        });

        await location.save({ session });
      } else {
        // Optionally, handle the case where location is not found
        throw new Error(`Location with deliveryId '${deliveryId}' not found.`);
      }
    }

    // 14. Commit the transaction and end the session
       });
    // 15. Respond with success
    res.status(200).json({ message: 'Delivery and billing updated successfully.' });
  } catch (error) {
    console.error('Error updating delivery and billing:', error);
    // Abort the transaction if an error occurred
    // End the session
    // Respond with error
    res.status(500).json({ message: error.message || 'Error updating delivery and billing.' });
  }finally{
        await session.endSession();
  }
});




// =========================
// Route: Get Customer Suggestions
// =========================

// Utility function to escape regex special characters

billingRouter.get('/customer/suggestions', async (req, res) => {
  const { search, suggestions } = req.query;
  
  // Validate query parameters
  if (suggestions !== "true" || !search) {
    return res.status(400).json({
      message: "Invalid request. Please provide both 'search' and set 'suggestions' to 'true'."
    });
  }
  
  try {
    const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    // Sanitize and create a case-insensitive regex
    const safeSearch = escapeRegex(search);
    const regex = new RegExp(safeSearch, 'i');

    // Fetch matching customers using aggregation for deduplication
    const customers = await CustomerAccount.aggregate([
      {
        $match: {
          $or: [
            { customerName: { $regex: regex } },
            { customerContactNumber: { $regex: regex } }
          ]
        }
      },
      {
        $group: {
          _id: {
            customerName: "$customerName",
            customerContactNumber: "$customerContactNumber",
            customerAddress: "$customerAddress",
            customerId: "$customerId"
          },
          doc: { $first: "$$ROOT" }
        }
      },
      {
        $replaceRoot: { newRoot: "$doc" }
      },
      {
        $project: {
          _id: 1,
          customerName: 1,
          customerContactNumber: 1,
          customerAddress: 1,
          customerId: 1,
        }
      },
      {
        $limit: 4
      }
    ]);

    res.json({ suggestions: customers });
  } catch (error) {
    console.error('Error fetching customer suggestions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


billingRouter.get('/sort/sales-report',
  expressAsyncHandler(async (req, res) => {
    const {
      fromDate,
      toDate,
      customerName,
      salesmanName,
      invoiceNo,
      paymentStatus,
      deliveryStatus,
      itemName,
      amountThreshold,
      sortField = 'invoiceDate',
      sortDirection = 'asc',
      page = 1,
      limit = 15
    } = req.query;

    /* ───── filters ─────────────────────────────────────────── */
    const filter = { isApproved: true };

    if (fromDate || toDate) {
      filter.invoiceDate = {};
      if (fromDate) filter.invoiceDate.$gte = new Date(fromDate);
      if (toDate)   filter.invoiceDate.$lte = new Date(toDate);
    }

    if (customerName)  filter.customerName  = { $regex: customerName,  $options: 'i' };
    if (salesmanName)  filter.salesmanName  = { $regex: salesmanName,  $options: 'i' };
    if (invoiceNo)     filter.invoiceNo     = { $regex: invoiceNo,     $options: 'i' };
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (deliveryStatus) filter.deliveryStatus = deliveryStatus;
    if (itemName)      filter['products.name'] = { $regex: itemName,   $options: 'i' };
    if (amountThreshold)
      filter.billingAmount = { $gte: parseFloat(amountThreshold) };

    /* ───── sort & pagination ───────────────────────────────── */
    const sort = { [sortField]: sortDirection === 'asc' ? 1 : -1 };
    const skip = (Number(page) - 1) * Number(limit);

    const total    = await Billing.countDocuments(filter);
    const billings = await Billing.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    res.json({ billings, total });
  })
);


billingRouter.put('/update-needed-purchase/:id', async (req, res) => {
  const session = await mongoose.startSession();
  try {
      await session.withTransaction(async () => {
    const incoming = Array.isArray(req.body.neededToPurchase)
      ? req.body.neededToPurchase
      : [];

    /* ──────────────────────────────────────────────────────────
       1)  Fetch the billing first
    ────────────────────────────────────────────────────────── */
    const billing = await Billing.findById(req.params.id);
    if (!billing) {
      throw new Error('Billing not found');
    }

    /* ──────────────────────────────────────────────────────────
       2)  Build a quick lookup of existing rows (by item_id)
    ────────────────────────────────────────────────────────── */
    const existingMap = new Map();
    billing.neededToPurchase.forEach((row) =>
      existingMap.set(row.item_id, row)
    );

    /* ──────────────────────────────────────────────────────────
       3)  Process each incoming item
    ────────────────────────────────────────────────────────── */
    const bulkNeedOps = [];              // ops for NeedToPurchase collection
    const newArray    = [];              // rebuilt Billing array

    for (const item of incoming) {
      const {
        item_id,
        name,
        quantityOrdered  = 0,
        quantityNeeded   = 0,
        purchased        = false,
        verified         = false,
        purchaseId,
        salesmanName
      } = item;

      // ---------- a)  update / insert inside Billing ----------
      const existing = existingMap.get(item_id);
      if (existing) {
        existing.quantityOrdered = quantityOrdered;
        existing.quantityNeeded  = quantityNeeded;
        existing.purchased       = purchased;
        existing.verified        = verified;
        newArray.push(existing);         // keep it
        existingMap.delete(item_id);     // mark as processed
      } else {
        newArray.push({
          item_id,
          name,
          quantityOrdered,
          quantityNeeded,
          purchased,
          verified,
        });
      }

      // ---------- b)  up-sert into NeedToPurchase -------------
      bulkNeedOps.push({
        updateOne: {
          filter: { invoiceNo: billing.invoiceNo, item_id },
          update: {
            $set: {
              name,
              quantity: quantityOrdered,
              quantityNeeded,
              requestedBy: billing.salesmanName || 'system',
              purchased,
              verified,
              invoiceNo: billing.invoiceNo,
              billingId: billing._id,
              purchaseId: purchaseId || '',
              salesmanName: billing.salesmanName
            },
          },
          upsert: true,
        },
      });
    }

    /* ──────────────────────────────────────────────────────────
       4)  Any rows left in existingMap were *removed* by client
           → pull them from NeedToPurchase + ignore in Billing
    ────────────────────────────────────────────────────────── */
    if (existingMap.size) {
      const idsToRemove = Array.from(existingMap.keys());
      bulkNeedOps.push({
        deleteMany: {
          filter: { invoiceNo: billing.invoiceNo, item_id: { $in: idsToRemove } },
        },
      });
    }

    /* ──────────────────────────────────────────────────────────
       5)  Commit both data-stores in parallel
    ────────────────────────────────────────────────────────── */
    billing.neededToPurchase = newArray;          // overwrite array
    // flag is handled automatically by your pre-save hook,
    // but we set it here for clarity/readability
    billing.isneededToPurchase = newArray.length > 0;

    await Promise.all([
      billing.save(),                            // 💾 Billing
      bulkNeedOps.length ? NeedToPurchase.bulkWrite(bulkNeedOps) : null,
    ]);

      });
    res.json({
      message: 'Needed-to-purchase section synchronised successfully',
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: 'Server error while updating need-to-purchase', error: error.message });
  }finally {
    await session.endSession();
  }
});




export default billingRouter;
