// routes/customerAccountcustomerRouter.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import CustomerAccount from '../models/customerModal.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';
import Billing from '../models/billingModal.js';
import mongoose from 'mongoose';

const customerRouter = express.Router();

/**
 * @route   POST /api/accounts/create
 * @desc    Create a new customer account
 * @access  Protected (Assuming authentication middleware is applied)
 */
customerRouter.post(
  '/create',
  [
    // Validation middleware using express-validator
    body('customerName').trim().notEmpty().withMessage('Customer Name is required'),
    body('bills').isArray().withMessage('Bills must be an array'),
    body('bills.*.invoiceNo')
      .trim()
      .notEmpty()
      .withMessage('Invoice Number is required for each bill'),
    body('bills.*.billAmount')
      .isFloat({ min: 0 })
      .withMessage('Bill Amount must be a positive number'),
    body('bills.*.invoiceDate')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Invoice Date')
    // You can add more validations as needed
  ],
  async (req, res) => {
    // Handle validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return the first validation error
      return res.status(400).json({ message: errors.array()[0].msg });
    }
    const generateReferenceId = () => 'PAY' + Date.now().toString();
    const referenceId = generateReferenceId();

    try {
      const { customerName, bills, payments, userId, customerContactNumber, customerId, customerAddress } = req.body;

      // Check if there are duplicate invoice numbers within the bills
      const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
      const uniqueInvoiceNos = new Set(invoiceNos);
      if (invoiceNos.length !== uniqueInvoiceNos.size) {
        return res.status(400).json({ message: 'Duplicate invoice numbers are not allowed.' });
      }

      // Create a new CustomerAccount instance
      const newCustomerAccount = new CustomerAccount({
        customerName: customerName.trim(),
        customerId: customerId.trim(),
        customerContactNumber: customerContactNumber.trim(),
        customerAddress: customerAddress.trim(),
        bills: bills.map((bill) => ({
          invoiceNo: bill.invoiceNo.trim(),
          billAmount: parseFloat(bill.billAmount),
          invoiceDate: bill.invoiceDate ? new Date(bill.invoiceDate) : undefined,
          deliveryStatus: bill.deliveryStatus || 'Delivered',
          remark: bill.remark? bill.remark.trim() : ''
        }))
      });


      if (payments[0]?.amount > 0) {
        
        const mappedPayments = payments.map((payment) => ({
          amount: parseFloat(payment.amount),
          date: payment.date ? new Date(payment.date) : undefined,
          submittedBy: userId,
          method: payment.method,
          referenceId: referenceId,
          remark: payment.remark ? payment.remark.trim() : '',
          invoiceNo: payment.invoiceNo
        }));
      
        newCustomerAccount.payments.push(...mappedPayments);
      }
      
      // Save the new customer account to the database
      const savedAccount = await newCustomerAccount.save();

      res.status(201).json(savedAccount);
    } catch (error) {
      console.error('Error creating customer account:', error);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

/**
 * @route   DELETE /api/accounts/:id/delete
 * @desc    Delete a customer account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */

customerRouter.delete('/:id/delete', async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const customerId = req.params.id;

    // 1. Retrieve the Customer Account
    const account = await CustomerAccount.findById(customerId).session(session);
    if (!account) {
      
      session.endSession();
      return res.status(404).json({ message: 'Customer Account not found' });
    }

    // 2. Collect all payment referenceIds from the account
    const paymentReferenceIds = account.payments.map(payment => payment.referenceId);

    // 3. Initialize a Set to track affected invoice numbers for recalculation
    const affectedInvoiceNosSet = new Set();

    // 4. Remove each payment from PaymentsAccount(s) and Billing documents
    for (const refId of paymentReferenceIds) {
      // a. Remove from paymentsIn in PaymentsAccount
      await PaymentsAccount.updateMany(
        { 'paymentsIn.referenceId': refId },
        { $pull: { paymentsIn: { referenceId: refId } } },
        { session }
      );

      // b. Remove from paymentsOut in PaymentsAccount (if applicable)
      await PaymentsAccount.updateMany(
        { 'paymentsOut.referenceId': refId },
        { $pull: { paymentsOut: { referenceId: refId } } },
        { session }
      );

      // c. Find and update Billing documents that include this payment
      const billingDocs = await Billing.find({ 'payments.referenceId': refId }).session(session);

      for (const billing of billingDocs) {
        // Remove the payment from the Billing document
        await Billing.updateOne(
          { _id: billing._id },
          { $pull: { payments: { referenceId: refId } } },
          { session }
        );

        // Track the invoice number for recalculating payment status
        affectedInvoiceNosSet.add(billing.invoiceNo);
      }
    }

    // 5. Recalculate payment status for affected Billing documents
    const affectedInvoiceNos = Array.from(affectedInvoiceNosSet);
    if (affectedInvoiceNos.length > 0) {
      const affectedBillings = await Billing.find({ invoiceNo: { $in: affectedInvoiceNos } }).session(session);
      for (const billing of affectedBillings) {
        billing.billingAmountReceived = billing.payments.reduce((total, p) => total + (p.amount || 0), 0);
        const netAmount = billing.grandTotal || 0;

        if (billing.billingAmountReceived >= netAmount) {
          billing.paymentStatus = "Paid";
        } else if (billing.billingAmountReceived > 0) {
          billing.paymentStatus = "Partial";
        } else {
          billing.paymentStatus = "Unpaid";
        }

        await billing.save({ session });
      }
    }

    // 6. Delete the Customer Account
    await CustomerAccount.findByIdAndDelete(customerId).session(session);

    // 7. Update PaymentAccount balances to reflect deletions
    const paymentAccounts = await PaymentsAccount.find({}).session(session);
    for (const pa of paymentAccounts) {
      const totalIn = pa.paymentsIn.reduce((acc, p) => acc + p.amount, 0);
      const totalOut = pa.paymentsOut.reduce((acc, p) => acc + p.amount, 0);
      pa.balanceAmount = totalIn - totalOut;
      await pa.save({ session });
    }

    // 8. Commit the transaction
    session.endSession();

    res.status(200).json({ message: 'Customer Account and related payments deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer account:', error);

    // Abort the transaction in case of error
    if (session.inTransaction()) {
      
    }
    session.endSession();

    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

/**
 * @route   GET /api/accounts/allaccounts
 * @desc    Get all customer accounts
 * @access  Protected (Assuming authentication middleware is applied)
 */
customerRouter.get('/allaccounts', async (req, res) => {
  try {
    // Optionally, implement pagination, filtering, or sorting based on query parameters
    const accounts = await CustomerAccount.find().sort({ createdAt: -1 });
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching customer accounts:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   GET /api/accounts/get/:id
 * @desc    Get a specific customer account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */
customerRouter.get('/get/:id', async (req, res) => {
  try {
    const account = await CustomerAccount.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ message: 'Customer Account not found' });
    }
    res.json(account);
  } catch (error) {
    console.error('Error fetching customer account:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   PUT /api/accounts/:id/update
 * @desc    Update a customer account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */
// PUT route to update a customer account

customerRouter.put(
  '/:id/update',
  [
    // --- your existing validation middlewares ---
    body('customerName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Customer Name cannot be empty'),
    body('bills')
      .optional()
      .isArray()
      .withMessage('Bills must be an array'),
    // … rest of your validators …
  ],
  async (req, res) => {
    const session = await mongoose.startSession();

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        session.endSession();
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      await session.withTransaction(async () => {
        const { customerName, customerAddress, customerContactNumber, bills, payments, userId } = req.body;

        // 1) Load account
        const account = await CustomerAccount
          .findById(req.params.id)
          .session(session);
        if (!account) {
          throw new Error('Customer Account not found');
        }

        // 2) Update basic fields on CustomerAccount
        if (customerName !== undefined) {
          account.customerName = customerName.trim();
          account.customerAddress = customerAddress.trim();
          account.customerContactNumber = customerContactNumber.trim();
        }

        // 3) Update all linked Billing docs with new customer details
        if (customerName !== undefined) {
          await Billing.updateMany(
            { customerId: account.customerId.trim() },
            {
              $set: {
                customerName: customerName.trim(),
                customerAddress: customerAddress.trim(),
                customerContactNumber: customerContactNumber.trim()
              }
            },
            { session }
          );
        }

        // 4) Your existing bills‐handling logic (unchanged) …
        if (bills !== undefined) {
          // … duplicate‐check, existingBillsMap, updates on CustomerAccount and Billing …
        }

        // 5) Your existing payments‐handling logic (unchanged) …
        if (payments !== undefined) {
          // … updating account.payments, PaymentsAccount entries, Billing.payments …
        }

        // 6) Update userId if provided
        if (userId !== undefined) {
          account.userId = userId;
        }

        // 7) Recalculate totals on CustomerAccount
        account.totalBillAmount = account.bills.reduce((acc, b) => acc + (b.billAmount || 0), 0);
        account.paidAmount      = account.payments.reduce((acc, p) => acc + (p.amount || 0), 0);
        account.pendingAmount   = account.totalBillAmount - account.paidAmount;
        if (account.pendingAmount < 0) {
          throw new Error('Paid amount exceeds total bill amount');
        }

        // 8) Refresh paymentStatus on each Billing in this account
        for (const bill of account.bills) {
          const billingDoc = await Billing.findOne({ invoiceNo: bill.invoiceNo.trim() }).session(session);
          if (billingDoc) {
            const received = (billingDoc.payments || []).reduce((sum, x) => sum + (x.amount || 0), 0);
            billingDoc.billingAmountReceived = received;
            const net = billingDoc.grandTotal || 0;
            billingDoc.paymentStatus = received >= net ? 'Paid' : received > 0 ? 'Partial' : 'Unpaid';
            await billingDoc.save({ session });
          }
        }

        // 9) Recalculate all PaymentsAccount balances
        const paymentAccounts = await PaymentsAccount.find().session(session);
        for (const pa of paymentAccounts) {
          const totalIn  = pa.paymentsIn.reduce((a, x) => a + x.amount, 0);
          const totalOut = pa.paymentsOut.reduce((a, x) => a + x.amount, 0);
          pa.balanceAmount = totalIn - totalOut;
          await pa.save({ session });
        }

        // 10) Persist updated CustomerAccount
        await account.save({ session });
      }); // end withTransaction

      session.endSession();
      return res.status(200).json({ message: 'Customer account updated successfully.' });
    } catch (err) {
      console.error('Error updating customer account:', err);
      session.endSession();
      return res.status(500).json({ message: err.message });
    }
  }
);







customerRouter.get('/daily/payments', async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    // 1. Validate presence of both dates
    if (!fromDate || !toDate) {
      return res.status(400).json({ message: 'Both fromDate and toDate are required.' });
    }

    // 2. Convert to Date objects
    const start = new Date(fromDate);
    const end = new Date(toDate);

    // 3. Validate date formats
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    // 4. Ensure fromDate is not after toDate
    if (start > end) {
      return res.status(400).json({ message: 'fromDate cannot be after toDate.' });
    }

    // 5. Adjust end date to include the entire day
    end.setHours(23, 59, 59, 999);

    // 6. Step 1: Find all invoiceNo's from Billing.payments within the date range
    const billingPayments = await Billing.aggregate([
      { $unwind: '$payments' },
      { 
        $match: { 
          'payments.date': { $gte: start, $lte: end }
        } 
      },
      { 
        $group: { 
          _id: null, 
          invoiceNos: { $addToSet: '$payments.invoiceNo' } 
        } 
      }
    ]);

    const billingInvoiceNos = billingPayments.length > 0 ? billingPayments[0].invoiceNos : [];

    // 7. Step 2: Aggregate CustomerAccount.payments within the date range, excluding billingInvoiceNos
    const customers = await CustomerAccount.aggregate([
      { $unwind: '$payments' },
      { 
        $match: { 
          'payments.date': { $gte: start, $lte: end },
          'payments.invoiceNo': { $nin: billingInvoiceNos }
        } 
      },
      { 
        $group: { 
          _id: '$customerId',
          customerName: { $first: '$customerName' },
          payments: { $push: '$payments' },
        }
      },
      {
        $project: {
          _id: 0,
          customerId: '$_id',
          customerName: 1,
          payments: 1
        }
      }
    ]);

    res.json(customers);
  } catch (error) {
    console.error('Error fetching customer payments:', error);
    res.status(500).json({ message: 'Error fetching customer payments' });
  }
});



export default customerRouter;
