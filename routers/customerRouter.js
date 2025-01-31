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
  session.startTransaction();

  try {
    const customerId = req.params.id;

    // 1. Retrieve the Customer Account
    const account = await CustomerAccount.findById(customerId).session(session);
    if (!account) {
      await session.abortTransaction();
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
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: 'Customer Account and related payments deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer account:', error);

    // Abort the transaction in case of error
    if (session.inTransaction()) {
      await session.abortTransaction();
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
    // Validation Middlewares
    body('customerName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Customer Name cannot be empty'),
    body('bills')
      .optional()
      .isArray()
      .withMessage('Bills must be an array'),
    body('bills.*.invoiceNo')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Invoice Number is required for each bill'),
    body('bills.*.billAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Bill Amount must be a positive number'),
    body('bills.*.invoiceDate')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Invoice Date'),
    body('payments')
      .optional()
      .isArray()
      .withMessage('Payments must be an array'),
    body('payments.*.amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Payment Amount must be a positive number'),
    body('payments.*.submittedBy')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Submitted By is required for each payment'),
    body('payments.*.date')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Payment Date'),
    // Additional validations as needed
  ],
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Handle validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { customerName, bills, payments, userId } = req.body;

      // Find the customer account by ID
      const account = await CustomerAccount.findById(req.params.id).session(session);
      if (!account) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Customer Account not found' });
      }

      // Update customer name if provided
      if (customerName !== undefined) {
        account.customerName = customerName.trim();
      }

      // === Handle Bills (Only Update, Do Not Remove Entire Billing Docs) ===
      if (bills !== undefined) {
        // Check for duplicate invoice numbers
        const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
        const uniqueInvoiceNos = new Set(invoiceNos);
        if (invoiceNos.length !== uniqueInvoiceNos.size) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: 'Duplicate invoice numbers are not allowed.'
          });
        }

        // Map existing bills by invoiceNo for quick updates
        const existingBillsMap = new Map(
          account.bills.map((bill) => [bill.invoiceNo.trim(), bill])
        );

        const updatedBills = [];

        for (const bill of bills) {
          const invoiceNo = bill.invoiceNo.trim();
          const existingBill = existingBillsMap.get(invoiceNo);

          const updatedBillData = {
            invoiceNo,
            billAmount: parseFloat(bill.billAmount),
            invoiceDate: bill.invoiceDate ? new Date(bill.invoiceDate) : new Date(),
            deliveryStatus: bill.deliveryStatus || (existingBill ? existingBill.deliveryStatus : 'Pending'),
          };

          if (existingBill) {
            // Update existing bill in CustomerAccount
            existingBill.billAmount = updatedBillData.billAmount;
            existingBill.invoiceDate = updatedBillData.invoiceDate;
            existingBill.deliveryStatus = updatedBillData.deliveryStatus;
            updatedBills.push(existingBill);

            // Also update billing doc if it exists
            const existingBilling = await Billing.findOne({ invoiceNo }).session(session).exec();
            if (existingBilling) {
              existingBilling.grandTotal = updatedBillData.billAmount;
              existingBilling.invoiceDate = updatedBillData.invoiceDate;
              existingBilling.deliveryStatus = updatedBillData.deliveryStatus;
              await existingBilling.save({ session });
            }

            existingBillsMap.delete(invoiceNo);
          } else {
            // New bill in CustomerAccount
            updatedBills.push(updatedBillData);

            // If a Billing doc with the same invoiceNo exists, update it
            const existingBilling = await Billing.findOne({ invoiceNo }).session(session).exec();
            if (existingBilling) {
              existingBilling.grandTotal = updatedBillData.billAmount;
              existingBilling.invoiceDate = updatedBillData.invoiceDate;
              existingBilling.deliveryStatus = updatedBillData.deliveryStatus;
              await existingBilling.save({ session });
            }
          }
        }

        // For any bills that are no longer in updated list, we do NOT remove billing docs.
        // We simply leave the Billing doc as is. We just won't include them in CustomerAccount anymore.
        // This means those bills are effectively removed from the CustomerAccount's bills array.
        account.bills = updatedBills;
      }

      // === Handle Payments ===
      if (payments !== undefined) {
        // Map existing payments by referenceId
        const existingPaymentsMap = new Map(
          account.payments.map((payment) => [payment.referenceId, payment])
        );

        const updatedPayments = [];

        // Helper function to find or create a PaymentsAccount by method
        const findOrCreatePaymentsAccount = async (method, session) => {
          let paymentAccount = await PaymentsAccount.findOne({ accountId: method }).session(session);
          if (!paymentAccount) {
            paymentAccount = new PaymentsAccount({
              accountId: method,
              accountName: 'NEW ACC',
              paymentsIn: [],
              paymentsOut: []
            });
          }
          return paymentAccount;
        };

        for (const payment of payments) {
          const {
            referenceId: incomingRefId,
            amount,
            date,
            submittedBy,
            remark,
            method,
            invoiceNo
          } = payment;

          const sanitizedMethod = method ? method.trim() : 'Cash';
          const sanitizedInvoiceNo = invoiceNo ? invoiceNo.trim() : '';
          const sanitizedSubmittedBy = submittedBy ? submittedBy.trim() : '';
          const parsedAmount = parseFloat(amount);

          // Generate a referenceId if not provided
          let referenceId = incomingRefId;
          if (!referenceId) {
            referenceId = 'PAY' + Date.now().toString() + Math.random();
          }

          const existingPayment = existingPaymentsMap.get(referenceId);

          if (existingPayment) {
            // === Updating an Existing Payment ===
            const oldMethod = existingPayment.method;
            const oldInvoiceNo = existingPayment.invoiceNo;

            // Update the payment in CustomerAccount
            existingPayment.amount = parsedAmount;
            existingPayment.date = date ? new Date(date) : existingPayment.date;
            existingPayment.submittedBy = sanitizedSubmittedBy;
            existingPayment.remark = remark ? remark.trim() : '';
            existingPayment.method = sanitizedMethod;
            existingPayment.invoiceNo = sanitizedInvoiceNo || existingPayment.invoiceNo;
            updatedPayments.push(existingPayment);
            existingPaymentsMap.delete(referenceId);

            // If payment method changed, move payment between PaymentAccounts
            if (sanitizedMethod !== oldMethod) {
              // Remove from old PaymentsAccount
              const oldPaymentAccount = await PaymentsAccount.findOne({ accountId: oldMethod }).session(session);
              if (oldPaymentAccount) {
                oldPaymentAccount.paymentsIn = oldPaymentAccount.paymentsIn.filter(
                  (p) => p.referenceId !== referenceId
                );
                await oldPaymentAccount.save({ session });
              }

              // Add to new PaymentsAccount
              const newPaymentAccount = await findOrCreatePaymentsAccount(sanitizedMethod, session);
              newPaymentAccount.paymentsIn.push({
                amount: parsedAmount,
                method: sanitizedMethod,
                submittedBy: sanitizedSubmittedBy,
                remark: remark ? remark.trim() : '',
                date: date ? new Date(date) : new Date(),
                referenceId,
              });
              await newPaymentAccount.save({ session });
            } else {
              // Method unchanged, just update in the same PaymentsAccount
              const samePaymentAccount = await PaymentsAccount.findOne({ accountId: sanitizedMethod }).session(session);
              if (samePaymentAccount) {
                const payIndex = samePaymentAccount.paymentsIn.findIndex((p) => p.referenceId === referenceId);
                if (payIndex !== -1) {
                  samePaymentAccount.paymentsIn[payIndex].amount = parsedAmount;
                  samePaymentAccount.paymentsIn[payIndex].date = date ? new Date(date) : samePaymentAccount.paymentsIn[payIndex].date;
                  samePaymentAccount.paymentsIn[payIndex].submittedBy = sanitizedSubmittedBy;
                  samePaymentAccount.paymentsIn[payIndex].remark = remark ? remark.trim() : '';
                  samePaymentAccount.paymentsIn[payIndex].method = sanitizedMethod;
                  await samePaymentAccount.save({ session });
                }
              }
            }

            // If invoiceNo changed, remove from old Billing and add to new Billing
            if (sanitizedInvoiceNo !== oldInvoiceNo && oldInvoiceNo) {
              // Remove payment from old Billing's payments
              await Billing.updateOne(
                { invoiceNo: oldInvoiceNo },
                { $pull: { payments: { referenceId } } },
                { session }
              );

              // Add to new Billing if exists
              if (sanitizedInvoiceNo) {
                const newBilling = await Billing.findOne({ invoiceNo: sanitizedInvoiceNo })
                  .session(session)
                  .exec();
                if (newBilling) {
                  newBilling.payments.push({
                    amount: parsedAmount,
                    method: sanitizedMethod,
                    date: date ? new Date(date) : new Date(),
                    referenceId,
                    remark: remark ? remark.trim() : '',
                    invoiceNo: sanitizedInvoiceNo,
                  });
                  await newBilling.save({ session });
                }
              }
            } else {
              // InvoiceNo not changed, just update in existing Billing if present
              if (existingPayment.invoiceNo) {
                const currentBilling = await Billing.findOne({
                  invoiceNo: existingPayment.invoiceNo,
                  'payments.referenceId': referenceId,
                }).session(session).exec();

                if (currentBilling) {
                  const billingPaymentIndex = currentBilling.payments.findIndex((p) => p.referenceId === referenceId);
                  if (billingPaymentIndex !== -1) {
                    currentBilling.payments[billingPaymentIndex].amount = parsedAmount;
                    currentBilling.payments[billingPaymentIndex].date = date
                      ? new Date(date)
                      : currentBilling.payments[billingPaymentIndex].date;
                    currentBilling.payments[billingPaymentIndex].submittedBy = sanitizedSubmittedBy;
                    currentBilling.payments[billingPaymentIndex].remark = remark ? remark.trim() : '';
                    currentBilling.payments[billingPaymentIndex].method = sanitizedMethod;
                    await currentBilling.save({ session });
                  }
                }
              }
            }

          } else {
            // === Creating a New Payment ===
            const newPaymentData = {
              amount: parsedAmount,
              date: date ? new Date(date) : new Date(),
              submittedBy: sanitizedSubmittedBy,
              remark: remark ? remark.trim() : '',
              referenceId,
              method: sanitizedMethod,
              invoiceNo: sanitizedInvoiceNo,
            };
            updatedPayments.push(newPaymentData);

            // Add to PaymentsAccount
// Correct way to pass session using method chaining
const paymentAccount = await PaymentsAccount.findOne({ accountId: sanitizedMethod }).session(session);
            paymentAccount.paymentsIn.push({
              amount: parsedAmount,
              method: sanitizedMethod,
              submittedBy: sanitizedSubmittedBy,
              remark: remark ? remark.trim() : '',
              date: date ? new Date(date) : new Date(),
              referenceId,
            });
            await paymentAccount.save({ session });

            // Add to Billing if invoiceNo given and exists
            if (sanitizedInvoiceNo) {
              const existingBilling = await Billing.findOne({ invoiceNo: sanitizedInvoiceNo })
                .session(session)
                .exec();
              if (existingBilling) {
                existingBilling.payments.push({
                  amount: parsedAmount,
                  method: sanitizedMethod,
                  date: date ? new Date(date) : new Date(),
                  referenceId,
                  remark: remark ? remark.trim() : '',
                  invoiceNo: sanitizedInvoiceNo,
                });
                await existingBilling.save({ session });
              }
            }
          }
        }

        // Remove any payments that are no longer in the updated list
        for (const [referenceId, oldPayment] of existingPaymentsMap) {
          // This means these payments were removed by the user (not present in updatedPayments)
          // Remove from CustomerAccount is already handled by not including them in updatedPayments
          // Remove from old PaymentsAccount
          const oldPaymentAccount = await PaymentsAccount.findOne({ accountId: oldPayment.method }).session(session);
          if (oldPaymentAccount) {
            oldPaymentAccount.paymentsIn = oldPaymentAccount.paymentsIn.filter(
              (p) => p.referenceId !== referenceId
            );
            await oldPaymentAccount.save({ session });
          }

          // Remove from Billing
          await Billing.updateMany(
            { 'payments.referenceId': referenceId },
            { $pull: { payments: { referenceId } } },
            { session }
          );
        }

        // Assign updated payments to the account
        account.payments = updatedPayments;
      }

      // Update userId if provided
      if (userId !== undefined) {
        account.userId = userId;
      }

      // Recalculate totalBillAmount, paidAmount, pendingAmount
      account.totalBillAmount = account.bills.reduce(
        (acc, bill) => acc + (bill.billAmount || 0),
        0
      );
      account.paidAmount = account.payments.reduce(
        (acc, payment) => acc + (payment.amount || 0),
        0
      );
      account.pendingAmount = account.totalBillAmount - account.paidAmount;

      if (account.pendingAmount < 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Paid amount exceeds total bill amount' });
      }

      // Recalculate payment status in Billing docs if needed:
      // Just ensure consistency. We'll do it for all Billings that were affected. 
      // A simple approach: Find all invoiceNos from account.bills and refresh them.
      // (If you prefer efficiency, track changed invoiceNos only, but here for clarity we do all.)
      for (const bill of account.bills) {
        const invoiceNo = bill.invoiceNo.trim();
        const billingDoc = await Billing.findOne({ invoiceNo }).session(session);
        if (billingDoc) {
          billingDoc.billingAmountReceived = (billingDoc.payments || []).reduce(
            (total, p) => total + (p.amount || 0),
            0
          );
          const netAmount = billingDoc.grandTotal || 0;
          if (billingDoc.billingAmountReceived >= netAmount) {
            billingDoc.paymentStatus = "Paid";
          } else if (billingDoc.billingAmountReceived > 0) {
            billingDoc.paymentStatus = "Partial";
          } else {
            billingDoc.paymentStatus = "Unpaid";
          }
          await billingDoc.save({ session });
        }
      }

      // Update PaymentAccounts balances:
      const paymentAccounts = await PaymentsAccount.find({}).session(session);
      for (const pa of paymentAccounts) {
        const totalIn = pa.paymentsIn.reduce((acc, p) => acc + p.amount, 0);
        const totalOut = pa.paymentsOut.reduce((acc, p) => acc + p.amount, 0);
        pa.balanceAmount = totalIn - totalOut;
        await pa.save({ session });
      }

      // Save updated customer account
      await account.save({ session });

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

      res.status(200).json({ message: 'Customer account updated successfully.' });
    } catch (error) {
      console.error('Error updating customer account:', error);

      // Abort the transaction on error
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      session.endSession();

      res.status(500).json({ message: 'Server Error', error: error.message });
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
