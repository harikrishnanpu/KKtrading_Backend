// controllers/sellerPaymentController.js
import express from 'express';
import SellerPayment from '../models/sellerPayments.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';
import expressAsyncHandler from 'express-async-handler';
import SupplierAccount from '../models/supplierAccountModal.js';
import mongoose from 'mongoose';

const sellerPaymentsRouter = express.Router();

// Get seller suggestions based on partial seller name
sellerPaymentsRouter.get(('/suggestions'), async (req, res) => {
  try {
    const search = req.query.search || '';
    const regex = new RegExp(search, 'i'); // case-insensitive search
    const sellers = await SellerPayment.find({ sellerName: regex }).select('sellerName');
    res.json(sellers);
  } catch (error) {
    console.error('Error fetching seller suggestions:', error);
    res.status(500).json({ message: 'Error fetching seller suggestions' });
  }
});

// Get seller details by ID
sellerPaymentsRouter.get("/get-seller/:id", async (req, res) => {
  try {
    let seller;
    let supplier;

    // 1. First try to find SupplierAccount by sellerId
    supplier = await SupplierAccount.findOne({ sellerId: req.params.id });

    // 2. If SupplierAccount found, get its SellerPayment
    if (supplier) {
      seller = await SellerPayment.findOne({ sellerId: req.params.id });
    } else {
      // 3. Fallback: Try to find SellerPayment by _id
      seller = await SellerPayment.findById(req.params.id);
      if (seller) {
        supplier = await SupplierAccount.findOne({ sellerId: seller.sellerId });
      }
    }

    // 4. If neither exists, return 404
    if (!supplier || !seller) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // 5. Recalculate totals (existing logic remains)
    const totalBillPart = supplier.bills.reduce((sum, bill) => sum + (bill.billAmount || 0), 0);
    const totalCashPart = supplier.bills.reduce((sum, bill) => sum + (bill.cashPart || 0), 0);
    const paidAmount = supplier.payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    const totalPendingAmount = totalBillPart + totalCashPart - paidAmount;

    const totalCashPartGiven = supplier.payments.reduce((sum, payment) => (
      payment.remark?.trim().toUpperCase().startsWith("CASH:") ? sum + payment.amount : sum
    ), 0);

    const totalBillPartGiven = supplier.payments.reduce((sum, payment) => (
      payment.remark?.trim().toUpperCase().startsWith("BILL:") ? sum + payment.amount : sum
    ), 0);

    // 6. Return combined data
    res.json({
      ...supplier.toObject(),
      totalBillPart,
      totalCashPart,
      paidAmount,
      totalPendingAmount,
      totalCashPartGiven,
      totalBillPartGiven,
      sellerId: supplier.sellerId, // Ensure consistent sellerId
      _id: seller._id // Include SellerPayment _id if needed
    });

  } catch (error) {
    console.error("Error fetching supplier details:", error);
    res.status(500).json({ message: "Error fetching supplier details" });
  }
});


sellerPaymentsRouter.get('/billpayments/all', async (req, res) => {
  try {
    // Get the date range from the query parameters sent from the frontend
    const { startDate, endDate } = req.query;

    // Validate if both startDate and endDate are provided
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }

    // Convert to Date objects
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Adjust the end date to include the entire day (if necessary)
    end.setHours(23, 59, 59, 999);

    // Fetch sellers and filter payments within the date range
    const sellers = await SellerPayment.find();
    if (!sellers || sellers.length === 0) {
      return res.status(404).json({ message: 'No seller data found' });
    }

    // Filter payments within the date range
    const paymentsByDate = sellers.map((seller) => {
      return {
        sellerId: seller.sellerId,
        sellerName: seller.sellerName,
        payments: seller.payments.filter(
          (payment) => new Date(payment.date) >= start && new Date(payment.date) <= end
        ),
      };
    });

    // Filter out sellers with no payments in the date range
    const filteredResults = paymentsByDate.filter((seller) => seller.payments.length > 0);

    res.json(filteredResults);
  } catch (error) {
    console.error('Error fetching seller payments:', error);
    res.status(500).json({ message: 'Error fetching seller payments' });
  }

});





// Add a payment to a seller
sellerPaymentsRouter.post(
  '/add-payments/:id',
  expressAsyncHandler(async (req, res) => {
    const session = await mongoose.startSession();

    try {
      // Handle validation errors
      // const errors = validationResult(req);
      // if (!errors.isEmpty()) {
      //   
      //   session.endSession();
      //   return res.status(400).json({ errors: errors.array() });
      // }

      const { id } = req.params; // Assuming 'id' refers to SupplierAccount ID
      const {
        amount,
        method,
        date,
        remark,
        sellerId,
        sellerName,
        userId,
      } = req.body;

      // Find the SellerPayment document
      const sellerPayment = await SellerPayment.findOne({ sellerId }).session(session);
      if (!sellerPayment) {
        
        session.endSession();
        return res.status(404).json({ message: 'Seller payment account not found' });
      }

      // Find the SupplierAccount document
      const supplierAccount = await SupplierAccount.findOne({ sellerId }).session(session);
      if (!supplierAccount) {
        
        session.endSession();
        return res.status(404).json({ message: 'Supplier account not found' });
      }

      // Find the PaymentsAccount by accountId (method)
      const paymentsAccount = await PaymentsAccount.findOne({ accountId: method }).session(session);
      if (!paymentsAccount) {
        
        session.endSession();
        return res.status(404).json({ message: `PaymentsAccount with accountId ${method} not found` });
      }

      // Generate a unique referenceId
      const paymentReferenceId = 'PAY' + Date.now().toString();

      // Create the payment object for SellerPayment
      const payment = {
        amount: parseFloat(amount),
        method: method.trim(),
        date: new Date(date),
        remark: remark ? remark.trim() : '',
        referenceId: paymentReferenceId,
        submittedBy: userId || 'Unknown', // Adjust according to your authentication setup
      };

      // Create the account payment entry for PaymentsAccount
      const accountPaymentEntry = {
        amount: parseFloat(amount),
        method: method.trim(),
        remark: `Purchase Payment to ${sellerName} - ${sellerId}`,
        submittedBy: userId || 'Unknown',
        date: new Date(date),
        referenceId: paymentReferenceId,
      };

      // Create the payment object for SupplierAccount
      const supplierPaymentEntry = {
        amount: parseFloat(amount),
        date: new Date(date),
        submittedBy: userId || 'Unknown',
        remark: remark ? remark.trim() : '',
        method: method.trim(),
        referenceId: paymentReferenceId,
      };

      // Add payment to PaymentsAccount.paymentsOut
      paymentsAccount.paymentsOut.push(accountPaymentEntry);
      // Recalculate totals
      paymentsAccount.totalAmountOut = (paymentsAccount.totalAmountOut || 0) + parseFloat(amount);
      paymentsAccount.balance = (paymentsAccount.balance || 0) - parseFloat(amount);
      await paymentsAccount.save({ session });

      // Add payment to SellerPayment.payments
      sellerPayment.payments.push(payment);
      // Recalculate totals
      sellerPayment.totalAmountPaid = (sellerPayment.totalAmountPaid || 0) + parseFloat(amount);
      sellerPayment.paymentRemaining = sellerPayment.totalAmountBilled - sellerPayment.totalAmountPaid;
      await sellerPayment.save({ session });

      // Add payment to SupplierAccount.payments
      supplierAccount.payments.push(supplierPaymentEntry);
      // Recalculate totals
      supplierAccount.paidAmount = (supplierAccount.paidAmount || 0) + parseFloat(amount);
      supplierAccount.pendingAmount = supplierAccount.totalBillAmount - supplierAccount.paidAmount;
      await supplierAccount.save({ session });

      // Ensure that pendingAmount does not go negative
      if (supplierAccount.pendingAmount < 0) {
        throw { status: 400, message: 'Paid amount exceeds total bill amount' };
      }

      // Commit the transaction
      session.endSession();

      res.status(200).json({ message: 'Payment added successfully', referenceId: paymentReferenceId });
    } catch (error) {
      console.error('Error adding payment:', error);

      // Abort the transaction on error
      if (session.inTransaction()) {
        
      }
      session.endSession();

      // Handle custom errors
      if (error.status && error.message) {
        return res.status(error.status).json({ message: error.message });
      }

      // Handle duplicate key errors (if any)
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern)[0];
        return res.status(400).json({ message: `${duplicateField} must be unique.` });
      }

      res.status(500).json({ message: 'Error adding payment', error: error.message });
    }
  }))


// Add a billing to a seller
sellerPaymentsRouter.post(('/add-billing/:id'), async (req, res) => {
  try {
    const seller = await SellerPayment.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }

    const { amount, date, purchaseId, invoiceNo } = req.body;

    if (!amount || !purchaseId || !invoiceNo) {
      return res.status(400).json({ message: 'Amount, purchaseId, and invoiceNo are required' });
    }

    const billing = {
      amount,
      date,
      purchaseId,
      invoiceNo,
    };

    await seller.addBilling(billing);
    res.json({ message: 'Billing added successfully' });
  } catch (error) {
    console.error('Error adding billing:', error);
    res.status(500).json({ message: 'Error adding billing' });
  }
});



// sellerPaymentsRouter.js







export default sellerPaymentsRouter;
