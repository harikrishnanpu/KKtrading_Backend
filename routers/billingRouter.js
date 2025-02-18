import express from 'express';
import Billing from '../models/billingModal.js';
import Product from '../models/productModel.js';
import Log from '../models/Logmodal.js';
import mongoose from 'mongoose';
import Purchase from '../models/purchasemodals.js';
import User from '../models/userModel.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';
import CustomerAccount from '../models/customerModal.js';
import SupplierAccount from '../models/supplierAccountModal.js';
import Location from '../models/locationModel.js';

const billingRouter = express.Router();


// =========================
// Route: Create Billing Entry
// =========================
billingRouter.post('/create', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
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
      unloading = 0,
      transportation = 0,
      handlingcharge = 0,
      remark,
      showroom,
      userId,
      isApproved,
      products, // Expected to be an array of objects with item_id and quantity
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
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // -----------------------
    // 2. Check for Existing Invoice
    // -----------------------
    const existingBill = await Billing.findOne({ invoiceNo }).session(session);
    if (existingBill) {
      const billing = await Billing.findOne({ invoiceNo: /^KK\d+$/ })
      .sort({ invoiceNo: -1 })
      .collation({ locale: "en", numericOrdering: true });

      if (billing) {
        const lastInvoiceNumber = parseInt(billing.invoiceNo.slice(2), 10) || 0; // Extract the number part after "KK"
        invoiceNo = "KK" + (lastInvoiceNumber + 1).toString().padStart(2, '0'); // Ensures at least two digits
      } else {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({ message: "Error generating new invoice number" });
      }

    }

    // -----------------------
    // 3. Calculate Total Amount After Discount
    // -----------------------
    const parsedBillingAmount = parseFloat(billingAmount);
    const parsedDiscount = parseFloat(discount);

    if (isNaN(parsedBillingAmount) || parsedBillingAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid billing amount' });
    }

    if (isNaN(parsedDiscount) || parsedDiscount < 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid discount amount' });
    }

    const totalAmount = parsedBillingAmount - parsedDiscount;
    if (totalAmount < 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: 'Discount cannot exceed billing amount' });
    }

    // -----------------------
    // 4. Fetch and Validate User
    // -----------------------
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found' });
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
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: `Invoice number ${invoiceNo} already exists for this customer`,
      });
    }

    // -----------------------
    // 6. Initialize Billing Data
    // -----------------------
    const billingData = new Billing({
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
      isApproved: isAdmin && isApproved || false, // Automatically approve if user is admin
      salesmanPhoneNumber: salesmanPhoneNumber.trim(),
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
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Invalid payment amount' });
      }

      // Ensure paymentAmount does not exceed totalAmount
      // if (parsedPaymentAmount > totalAmount) {
      //   await session.abortTransaction();
      //   session.endSession();
      //   return res.status(400).json({
      //     message:
      //       'Payment amount cannot exceed total amount after discount',
      //   });
      // }

      const currentDate = new Date(paymentReceivedDate || Date.now());

      const paymentReferenceId = 'PAY' + Date.now().toString();

      const paymentEntry = {
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        date: currentDate,
        referenceId: paymentReferenceId,
        method: paymentMethod.trim(),
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
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Payment account not found' });
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
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Salesman user not found' });
    }

    // -----------------------
    // 10. Conditionally Update Stock
    // -----------------------
    let productUpdatePromises = [];
    if (isAdmin && isApproved) {
      // Only update stock if the user is admin during creation
      for (const item of products) {
        const { item_id, quantity } = item;

        // Validate individual product details
        if (!item_id || isNaN(quantity) || quantity <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: 'Invalid product details' });
        }

        // Fetch product using item_id
        const product = await Product.findOne({
          item_id: item_id.trim(),
        }).session(session);
        if (!product) {
          await session.abortTransaction();
          session.endSession();
          return res
            .status(404)
            .json({ message: `Product with ID ${item_id} not found` });
        }

        // Check if there is enough stock
        if (product.countInStock < quantity) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: `Insufficient stock for product ID ${item_id}`,
          });
        }

        // Deduct the stock
        product.countInStock -= parseFloat(quantity);
        productUpdatePromises.push(product.save({ session }));
      }
    }

    // -----------------------
    // 11. Save Billing Data and Update Products
    // -----------------------
    await customerAccount.save({ session });
    await billingData.save({ session });

    if (isAdmin) {
      await Promise.all(productUpdatePromises);
    }

    // -----------------------
    // 12. Commit the Transaction
    // -----------------------
    await session.commitTransaction();
    session.endSession();

    // -----------------------
    // 13. Respond to Client
    res.status(201).json({
      message: 'Billing data saved successfully',
      billingData,
    });

  } catch (error) {
    console.log('Error saving billing data:', error);
    // Attempt to abort the transaction if it's still active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(500).json({
      message: 'Error saving billing data',
      error: error.message,
    });
  }
});



// =========================
// Route: Edit Billing Entry
// =========================
billingRouter.post('/edit/:id', async (req, res) => {
  const billingId = req.params.id;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // === Extract fields from request body ===
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
      discount = 0,
      unloading = 0,
      transportation = 0,
      handlingcharge = 0,
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
      userId,
      showroom,
      salesmanPhoneNumber,
    } = req.body;

    // === Basic Validation ===
    if (
      !invoiceNo ||
      !invoiceDate ||
      !salesmanName ||
      !expectedDeliveryDate ||
      !billingAmount ||
      !customerName ||
      !customerAddress ||
      !customerContactNumber ||
      !customerId ||
      !products ||
      !Array.isArray(products) ||
      products.length === 0
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'Missing required fields. Ensure all mandatory fields are provided.',
      });
    }

    // === Fetch Billing Record ===
    const existingBilling = await Billing.findById(billingId).session(session);
    if (!existingBilling) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Billing record not found.' });
    }

    // === Fetch User Performing the Operation ===
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found.' });
    }

    const isAdmin = user.isAdmin;
    const isBillApproved = existingBilling.isApproved;

    // === Prepare Product Data ===
    const updatedProductIds = products.map((item) => item.item_id.trim());

    // Fetch all products involved in the update in a single query
    const fetchedProducts = await Product.find({
      item_id: { $in: updatedProductIds },
    }).session(session);

    // Create a map for quick access
    const productMap = {};
    fetchedProducts.forEach((product) => {
      productMap[product.item_id] = product;
    });

    // === Product Updates ===
    const existingProductIds = existingBilling.products.map((p) => p.item_id);
    const productsToRemove = existingBilling.products.filter(
      (p) => !updatedProductIds.includes(p.item_id)
    );

    // 1. Remove Products Not in Updated List
    for (const product of productsToRemove) {
      const productInDB = await Product.findOne({ item_id: product.item_id }).session(session);
      if (productInDB) {
        // Return stock if bill is approved or user is admin
        if (isBillApproved || isAdmin) {
          productInDB.countInStock += parseFloat(product.quantity);
          await productInDB.save({ session });
        }
      }
      existingBilling.products.pull(product._id);
    }

    // 2. Update Existing and Add New Products
    const productUpdatePromises = [];
    for (const updatedProduct of products) {
      const {
        item_id,
        name,
        category,
        brand,
        quantity,
        sellingPrice,
        enteredQty,
        sellingPriceinQty,
        unit,
        length,
        breadth,
        psRatio,
        size,
        gstRate,
        itemRemark
      } = updatedProduct;

      const trimmedItemId = item_id.trim();
      const newQuantity = parseFloat(quantity);

      const productInDB = productMap[trimmedItemId];
      if (!productInDB) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `Product with ID ${trimmedItemId} not found.` });
      }

      const existingProductInBilling = existingBilling.products.find(
        (p) => p.item_id === trimmedItemId
      );

      if (existingProductInBilling) {
        // Existing product in billing
        const previousQuantity = parseFloat(existingProductInBilling.quantity);
        const quantityDifference = newQuantity - previousQuantity;

        if (isBillApproved || isAdmin) {
          const newStockCount = productInDB.countInStock - quantityDifference;
          if (newStockCount < 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              message: `Insufficient stock for product ID ${trimmedItemId}. Only ${
                productInDB.countInStock + previousQuantity
              } available.`,
            });
          }

          productInDB.countInStock = newStockCount;
          productUpdatePromises.push(productInDB.save({ session }));
        }

        // Update product details in billing
        existingProductInBilling.set({
          quantity: newQuantity,
          sellingPrice: parseFloat(sellingPrice) || 0,
          enteredQty: parseFloat(enteredQty) || 0,
          sellingPriceinQty: parseFloat(sellingPriceinQty) || 0,
          unit: unit || existingProductInBilling.unit,
          length: parseFloat(length) || 0,
          breadth: parseFloat(breadth) || 0,
          psRatio: parseFloat(psRatio) || 0,
          size: size || productInDB.size,
          gstRate: parseFloat(gstRate) || 0,
          itemRemark: itemRemark
        });
      } else {
        // New product to add
        if (isBillApproved || isAdmin) {
          if (productInDB.countInStock < newQuantity) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              message: `Insufficient stock for product ID ${trimmedItemId}. Only ${productInDB.countInStock} available.`,
            });
          }

          productInDB.countInStock -= newQuantity;
          productUpdatePromises.push(productInDB.save({ session }));
        }

        existingBilling.products.push({
          item_id: trimmedItemId,
          name: name || productInDB.name,
          sellingPrice: parseFloat(sellingPrice) || 0,
          quantity: newQuantity,
          category: category || productInDB.category,
          brand: brand || productInDB.brand,
          unit: unit || productInDB.unit,
          sellingPriceinQty: parseFloat(sellingPriceinQty) || 0,
          enteredQty: parseFloat(enteredQty) || 0,
          length: parseFloat(length) || 0,
          breadth: parseFloat(breadth) || 0,
          psRatio: parseFloat(psRatio) || 0,
          size: productInDB.size || size,
          gstRate: parseFloat(gstRate) || 0,
          itemRemark: itemRemark
        });
      }
    }
    existingBilling.markModified('products');

    // === Customer Account Handling ===

    const oldCustomerId = existingBilling.customerId;
    const isCustomerChanged = oldCustomerId !== customerId.trim();

    // Update billing with new customer details (even if unchanged)
    existingBilling.set({
      customerId: customerId.trim(),
      customerName: customerName.trim(),
      customerAddress: customerAddress.trim(),
      customerContactNumber: customerContactNumber.trim(),
    });

    // Fetch or create new customer account
    let customerAccount = await CustomerAccount.findOne({ customerId: customerId.trim() }).session(session);
    if (!customerAccount) {
      // Create new customer account
      customerAccount = new CustomerAccount({
        customerId: customerId.trim(),
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim(),
        customerContactNumber: customerContactNumber.trim(),
        bills: [],
        payments: [],
      });
    } else {
      // Update existing customer details
      customerAccount.set({
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim(),
        customerContactNumber: customerContactNumber.trim(),
      });
    }

    // Check if this bill exists in the new customer's account
    let existingBillInNewCustomer = customerAccount.bills.find(
      (bill) => bill.invoiceNo === invoiceNo.trim()
    );

    if (!existingBillInNewCustomer) {
      // Add the bill
      customerAccount.bills.push({
        invoiceNo: invoiceNo.trim(),
        billAmount: parseFloat(grandTotal),
        invoiceDate: new Date(invoiceDate),
        deliveryStatus,
      });
    } else {
      // Update the bill details
      existingBillInNewCustomer.set({
        billAmount: parseFloat(grandTotal),
        invoiceDate: new Date(invoiceDate),
        deliveryStatus,
      });
    }
    customerAccount.markModified('bills');

    // If customer changed, remove the bill and related payments from old customer, add to new
    if (isCustomerChanged) {
      const oldCustomerAccount = await CustomerAccount.findOne({ customerId: oldCustomerId }).session(session);
      if (oldCustomerAccount) {
        // Remove bill from old customer
        oldCustomerAccount.bills = oldCustomerAccount.bills.filter(
          (bill) => bill.invoiceNo !== invoiceNo.trim()
        );
        oldCustomerAccount.markModified('bills');

        // Move any payments associated with this bill
        const paymentsToTransfer = oldCustomerAccount.payments.filter(
          (payment) => payment.invoiceNo === invoiceNo.trim()
        );

        // Remove them from old customer
        oldCustomerAccount.payments = oldCustomerAccount.payments.filter(
          (payment) => payment.invoiceNo !== invoiceNo.trim()
        );
        oldCustomerAccount.markModified('payments');

        // Save old customer account changes
        await oldCustomerAccount.save({ session });

        // Add these payments to the new customer account
        if (paymentsToTransfer.length > 0) {
          customerAccount.payments.push(...paymentsToTransfer);
          customerAccount.markModified('payments');
        }
      }
    }

    // === Payment Handling ===
    if (paymentAmount && paymentMethod) {
      const parsedPaymentAmount = parseFloat(paymentAmount);
      if (isNaN(parsedPaymentAmount) || parsedPaymentAmount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Invalid payment amount.' });
      }

      const totalAmount = parseFloat(billingAmount) - parseFloat(discount || 0);
      // if (parsedPaymentAmount > totalAmount) {
      //   await session.abortTransaction();
      //   session.endSession();
      //   return res.status(400).json({
      //     message: 'Payment amount cannot exceed the total amount after discount.',
      //   });
      // }

      const paymentReferenceId = 'PAY' + Date.now().toString();
      const currentDate = new Date(paymentReceivedDate || Date.now());

      // Create a payment entry
      const paymentEntry = {
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        date: currentDate,
        referenceId: paymentReferenceId,
        invoiceNo: invoiceNo.trim(),
      };

      // Add payment to billing
      existingBilling.payments.push(paymentEntry);

      // Add payment to new customer account
      customerAccount.payments.push({
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        remark: `Bill ${invoiceNo.trim()}`,
        submittedBy: userId,
        date: currentDate,
        referenceId: paymentReferenceId,
        invoiceNo: invoiceNo.trim(),
      });
      customerAccount.markModified('payments');

      // Update Payment Account
      const account = await PaymentsAccount.findOne({ accountId: paymentMethod.trim() }).session(session);
      if (!account) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Payment account not found.' });
      }

      const accountPaymentEntry = {
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        remark: `Bill ${invoiceNo.trim()}`,
        submittedBy: userId,
        date: currentDate,
        referenceId: paymentReferenceId,
      };

      account.paymentsIn.push(accountPaymentEntry);
      account.markModified('paymentsIn');
      await account.save({ session });
    }

    // === Update Billing Details ===
    existingBilling.set({
      invoiceNo: invoiceNo.trim(),
      invoiceDate: new Date(invoiceDate),
      salesmanName: salesmanName.trim(),
      expectedDeliveryDate: new Date(expectedDeliveryDate),
      billingAmount: parseFloat(billingAmount) || 0,
      grandTotal: parseFloat(grandTotal) || 0,
      discount: parseFloat(discount) || 0,
      showroom: showroom,
      unloading: parseFloat(unloading) || 0,
      transportation: parseFloat(transportation) || 0,
      handlingCharge: parseFloat(handlingcharge) || 0,
      remark: remark ? remark.trim() : existingBilling.remark,
      marketedBy: marketedBy ? marketedBy.trim() : existingBilling.marketedBy,
      paymentStatus: paymentStatus || existingBilling.paymentStatus,
      deliveryStatus: deliveryStatus || existingBilling.deliveryStatus,
      salesmanPhoneNumber: salesmanPhoneNumber.trim(),
      roundOff: parseFloat(roundOff) || 0,
    });

    // === Update Salesman Phone Number ===
    const salesmanUser = await User.findOne({ name: salesmanName.trim() }).session(session);
    if (!salesmanUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Salesman user not found' });
    }
    salesmanUser.contactNumber = salesmanPhoneNumber.trim();
    await salesmanUser.save({ session });

    // === Update Stock if Admin or Bill Approved ===
    if (isAdmin || isBillApproved) {
      await Promise.all(productUpdatePromises);
    }

    // === Save Updated Billing and Customer Account ===
    await existingBilling.save({ session });
    await customerAccount.save({ session });

    // === Commit Transaction ===
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ message: 'Billing data updated successfully.', existingBilling });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    console.error('Error updating billing data:', error);

    return res.status(500).json({
      message: 'Error updating billing data.',
      error: error.message,
    });
  }
});







// =========================
// Route: Delete Billing Entry
// =========================
billingRouter.delete('/billings/delete/:id', async (req, res) => {
  // Start a MongoDB session for transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const billingId = req.params.id;

    // === 1. Authenticate and Authorize User ===
    const { userId } = req.query;

    // Ensure userId is sent in the request body
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: 'User ID is required for authorization.' });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found.' });
    }

    const isAdmin = user.isAdmin;
    if (!isAdmin) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(403)
        .json({ message: 'Unauthorized. Admin privileges required.' });
    }

    // === 2. Fetch the Billing Record ===
    const billing = await Billing.findById(billingId).session(session);
    
    if (!billing) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Billing record not found.' });
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

    // if (!customerAccount) {
    //   await session.abortTransaction();
    //   session.endSession();
    //   return res.status(404).json({ message: 'Customer account not found.' });
    // }

    if(customerAccount){

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

        // Validate product details
        if (!item_id || isNaN(quantity) || quantity <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: 'Invalid product details in billing.',
          });
        }

        // Fetch the product
        const product = await Product.findOne({
          item_id: item_id.trim(),
        }).session(session);
        if (product) {
          // Restore the stock only if the billing was approved or the user is admin
          if (isApproved || isAdmin) {
            product.countInStock += parseFloat(quantity);
            await product.save({ session });
          }
        } else {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({
            message: `Product with ID ${item_id.trim()} not found.`,
          });
        }
      }
    }

    // === 7. Remove the Billing Entry ===
    const deletedBill = await Billing.findOneAndDelete({ _id: billingId }).session(session);
    console.log(deletedBill);

    if(customerAccount){
      // === 8. Save the Updated Customer Account ===
      await customerAccount.save({ session });
    }
      
    // === 9. Commit the Transaction ===
    await session.commitTransaction();
    session.endSession();

    // === 10. Respond to the Client ===
    res.status(200).json({ message: 'Billing record deleted successfully.' });
  } catch (error) {
    console.log('Error deleting billing record:', error);

    // Attempt to abort the transaction if it's still active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(500).json({
      message: 'Error deleting billing record.',
      error: error.message,
    });
  }
});





// =========================
// Route: Approve Billing Entry
// =========================
billingRouter.put('/bill/approve/:billId', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { billId } = req.params;
    const { userId } = req.body; // Assuming the approving userId is sent in the body

    // Fetch the user performing the approval
    const approvingUser = await User.findById(userId).session(session);
    if (!approvingUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Approving user not found' });
    }

    if (!approvingUser.isAdmin) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ error: 'Only admins can approve bills' });
    }

    // Find the existing bill
    const existingBill = await Billing.findById(billId).session(session);
    if (!existingBill) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Check if the bill is already approved
    if (existingBill.isApproved) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Bill is already approved' });
    }

    // Update bill status to 'approved'
    existingBill.isApproved = true;
    existingBill.approvedBy = userId;

    // -----------------------
    // 1. Update Stock During Approval
    // -----------------------
    const productUpdatePromises = [];
    for (const item of existingBill.products) {
      const { item_id, quantity } = item;

      // Fetch product using item_id
      const product = await Product.findOne({ item_id }).session(session);
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `Product with ID ${item_id} not found` });
      }

      // Check if there is enough stock
      if (product.countInStock < quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: `Insufficient stock for product ID ${item_id}` });
      }

      // Deduct the stock
      product.countInStock -= parseFloat(quantity);
      productUpdatePromises.push(product.save({ session }));
    }

    // Save the updated bill
    await existingBill.save({ session });

    // Update all product stock counts
    await Promise.all(productUpdatePromises);

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Bill approved successfully', bill: existingBill });
  } catch (error) {
    console.error('Error approving bill:', error);

    // Abort transaction on error
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    res.status(500).json({ error: 'Internal server error', details: error.message });
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
  


billingRouter.get('/driver/', async (req, res) => {
  const page = parseFloat(req.query.page) || 1; // Default to page 1
  const limit = parseFloat(req.query.limit) || 3; // Default to 10 items per page

  try {
    const totalBillings = await Billing.find({ deliveryStatus: 'Pending' }).countDocuments(); // Get total billing count
    
    const billings = await Billing.find({ deliveryStatus: 'Pending' }) // Filter by deliveryStatus
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

    const billings = await Billing.find({expectedDeliveryDate: { $gte: today },deliveryStatus: { $ne: 'Delivered' }}).sort({ expectedDeliveryDate: 1 }).limit(1); // Limit to 3 products
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
    const billings = await Billing.find({expectedDeliveryDate: {$gte: today}, deliveryStatus: { $ne: 'Delivered' }}).sort({ expectedDeliveryDate: 1 }) // Limit to 3 products
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
        { deliveryStatus: { $nin: ["Delivered"] } } // Exclude 'Delivered' status
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
    // Fetch the invoice with the highest sequence number starting with 'K'
    const billing = await Billing.findOne({ invoiceNo: /^KK\d+$/ })
      .sort({ invoiceNo: -1 })
      .collation({ locale: "en", numericOrdering: true });

    let lastGeneratedCustomer = null;

      lastGeneratedCustomer = await CustomerAccount.aggregate([
        {
          $addFields: {
            numericId: {
              $toInt: {
                $cond: {
                  if: { $regexMatch: { input: "$customerId", regex: /^CUS\d+$/ } }, // Check if format matches
                  then: { $substr: ["$customerId", 3, -1] }, // Extract numeric part (corrected index)
                  else: "0" // Default to 0 for invalid or missing customerId
                }
              }
            }
          }
        },
        {
          $sort: { numericId: -1 } // Sort by numericId in descending order
        },
        {
          $limit: 1 // Get the record with the highest numericId
        }
      ]);

    let lastInvoice = 'KK0';
    let lastCustomerId = 'CUS0';

    if (billing) {
      lastInvoice = billing.invoiceNo;
    }

    if (lastGeneratedCustomer && lastGeneratedCustomer.length > 0) {
      lastCustomerId = lastGeneratedCustomer[0].customerId;
    }

    res.json({ lastInvoice, lastCustomerId });
  } catch (error) {
    console.error('Error fetching last order details:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});





billingRouter.post("/billing/:id/addExpenses", async (req, res) => {
  try {
    const { id } = req.params;
    const { otherExpenses = [], paymentMethod, userId } = req.body;

    // Find the billing document by ID
    const billing = await Billing.findById(id);
    if (!billing) {
      return res.status(404).json({ message: "Billing not found" });
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
      return res.status(400).json({ message: "No valid expenses provided." });
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
        return res.status(404).json({ message: "Payment account not found" });
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

      await account.save();
    } catch (error) {
      console.log("Error processing payment:", error);
      return res.status(500).json({ message: "Error processing payment", error });
    }

    // Save the updated document
    await billing.save();

    res.status(200).json({ message: "Expenses added successfully", billing });
  } catch (error) {
    console.error("Error adding expenses:", error);
    res.status(500).json({ message: "Error adding expenses" });
  }
});


// DELETE function for other expenses
// DELETE function for other expenses
billingRouter.delete("/billing/:id/deleteExpense/:expenseId", async (req, res) => {
  try {
    const { id, expenseId } = req.params;

    // Find the billing document by ID
    const billing = await Billing.findById(id);
    if (!billing) {
      return res.status(404).json({ message: "Billing not found" });
    }

    // Find and remove the expense by its _id
    const expenseIndex = billing.otherExpenses.findIndex(
      (expense) => expense._id.toString() === expenseId
    );

    if (expenseIndex === -1) {
      return res.status(404).json({ message: "Expense not found" });
    }

    const [removedExpense] = billing.otherExpenses.splice(expenseIndex, 1);

    try {
      const referenceId = removedExpense.referenceId;

      const account = await PaymentsAccount.findOne({ accountId: removedExpense.method });

      if (!account) {
        console.log(`No account found for accountId: ${removedExpense.method}`);
        return res.status(404).json({ message: "Payment account not found" });
      }

      // Remove the corresponding payment from the account's paymentsOut based on the referenceId
      const paymentIndex = account.paymentsOut.findIndex(
        (payment) => payment.referenceId === referenceId
      );

      if (paymentIndex !== -1) {
        account.paymentsOut.splice(paymentIndex, 1);
        await account.save();
      }
    } catch (error) {
      console.error("Error updating payment account:", error);
      return res.status(500).json({ message: "Error updating payment account" });
    }

    // Save the updated billing document
    await billing.save();

    res.status(200).json({ message: "Expense deleted successfully", billing });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ message: "Error deleting expense" });
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
  session.startTransaction();

  try {
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
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: 'Delivery deleted successfully and related data updated.' });
  } catch (error) {
    console.error('Error deleting delivery:', error);
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(500).json({ message: error.message || 'Error deleting delivery.' });
  }
});





// PUT /api/users/billing/update-delivery
billingRouter.put('/update-delivery/update', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      deliveryId,
      startingKm,
      endKm,
      fuelCharge,
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
    const existingExpensesMap = new Map(delivery.otherExpenses.map(e => [e._id.toString(), e]));

    for (const expense of updatedOtherExpenses) {
      const { id, amount, remark } = expense;

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < 0) {
        throw new Error("Expense amount must be a non-negative number.");
      }

      if (id) {
        // Update existing expense if it exists
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
        // Add new expense
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
    await session.commitTransaction();
    session.endSession();

    // 15. Respond with success
    res.status(200).json({ message: 'Delivery and billing updated successfully.', data: billing });
  } catch (error) {
    console.error('Error updating delivery and billing:', error);
    // Abort the transaction if an error occurred
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    // End the session
    session.endSession();
    // Respond with error
    res.status(500).json({ message: error.message || 'Error updating delivery and billing.' });
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


billingRouter.get('/sort/sales-report', async (req, res) => {
  try {
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
      sortField,
      sortDirection,
    } = req.query;

    let filter = {};

    // Filter by date range
    if (fromDate || toDate) {
      filter.invoiceDate = {};
      if (fromDate) {
        filter.invoiceDate.$gte = new Date(fromDate);
      }
      if (toDate) {
        filter.invoiceDate.$lte = new Date(toDate);
      }
    }

    // Filter by customer name
    if (customerName) {
      filter.customerName = { $regex: customerName, $options: 'i' };
    }

    // Filter by salesman name
    if (salesmanName) {
      filter.salesmanName = { $regex: salesmanName, $options: 'i' };
    }

    // Filter by invoice number
    if (invoiceNo) {
      filter.invoiceNo = { $regex: invoiceNo, $options: 'i' };
    }

    // Filter by payment status
    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }

    // Filter by delivery status
    if (deliveryStatus) {
      filter.deliveryStatus = deliveryStatus;
    }

    // Filter by item name
    if (itemName) {
      filter['products.name'] = { $regex: itemName, $options: 'i' };
    }

    // Filter by amount threshold
    if (amountThreshold) {
      filter.billingAmount = { $gte: parseFloat(amountThreshold) };
    }

    // Sorting
    let sort = {};
    if (sortField) {
      sort[sortField] = sortDirection === 'asc' ? 1 : -1;
    } else {
      sort = { invoiceDate: -1 }; // Default sorting
    }

    // Fetch billings with filters and sorting
    const billings = await Billing.find(filter).sort(sort);

    res.json(billings);
  } catch (error) {
    console.error('Error fetching billings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


billingRouter.put('/update-needed-purchase/:id', async (req, res) => {
  try {
    const { neededToPurchase } = req.body; // Expect an array of items
    const billing = await Billing.findById(req.params.id);
    if (!billing) {
      return res.status(404).json({ message: 'Billing not found' });
    }
    // Update the neededToPurchase array
    billing.neededToPurchase = neededToPurchase;
    await billing.save();
    res.json({ message: 'Needed to purchase section updated successfully', billing });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});




export default billingRouter;
