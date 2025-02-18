import express from 'express';
import Purchase from '../models/purchasemodals.js';
import TransportPayment from '../models/transportPayments.js';


const purchaseRouter = express.Router();


purchaseRouter.get('/get/:id', async (req, res) => {
    const purchase = await Purchase.findById(req.params.id);
    if (purchase) {
      res.json(purchase);
    } else {
      res.status(404);
      throw new Error("Purchase not found");
    }
});

purchaseRouter.get('/bill/get/allpurchases', async (req, res) => {
  const purchases = await Purchase.find({});
  if (purchases) {
    res.json(purchases);
  } else {
    res.status(404);
    throw new Error("Purchase not found");
  }
});
 

purchaseRouter.get("/purchase/suggestions", async (req, res) => {
  try {
    let { search = "" } = req.query;
    search = search.replace(/\s+/g, "").toUpperCase(); // Normalize the search term

    // Search both `invoiceNo` and `customerName` fields with case insensitive regex
    const suggestions = await Purchase.find({
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


purchaseRouter.get("/suggestions", async (req, res) => {
  try {
    let { search = "" } = req.query;
    search = search.replace(/\s+/g, "").toUpperCase(); // Normalize the search term

    // Search both `invoiceNo` and `customerName` fields with case insensitive regex
    const suggestions = await Purchase.find({
      $or: [
        { invoiceNo: { $regex: search, $options: "i" } },
        { sellerName: { $regex: search, $options: "i" } }
      ]
    }).limit(5); // Limit suggestions to 5

    res.status(200).json(suggestions);
  } catch (error) {
    console.error("Error fetching suggestions:", error); // Log the error for debugging
    res.status(500).json({ message: "Error fetching suggestions" });
  }
  
});


purchaseRouter.post('/:id/payments', async (req, res) => {
    const { amount, method, remark, date } = req.body;

    const purchase = await Purchase.findById(req.params.id);
  
    if (purchase) {
      const payment = {
        amount,
        method,
        remark,
        date
      };
  
      purchase.payments.push(payment);
  
      // Recalculate payment status
      const totalPayments = purchase.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0
      );
  
      if (totalPayments >= purchase.totalAmount) {
        purchase.paymentStatus = "Paid";
      } else if (totalPayments > 0) {
        purchase.paymentStatus = "Partial";
      } else {
        purchase.paymentStatus = "Pending";
      }
  
      await purchase.save();
  
      res.status(201).json({ message: "Payment added successfully" });
    } else {
      res.status(404);
      throw new Error("Purchase not found");
    }
})




purchaseRouter.get('/payments/suggesstion', async (req, res) => {
    const { search, suggestions } = req.query;

    if (suggestions === "true" && search) {
      const regex = new RegExp(search, "i"); // case-insensitive search
      const purchases = await Purchase.find({ invoiceNo: { $regex: regex } })
        .select("_id invoiceNo")
        .limit(10);
      res.json(purchases);
    } else {
      // Handle other GET requests if needed
      res.status(400).json({ message: "Invalid request" });
    }
});


purchaseRouter.get('/get-all/transportCompany', async (req, res) => {
  const transportCompanies = await TransportPayment.distinct('transportName');
  res.json(transportCompanies);
});



purchaseRouter.get('/lastOrder/id', async (req, res) => {
  try {
    // Fetch the invoice with the highest sequence number starting with 'K'
    const billing = await Purchase.findOne({ purchaseId: /^KP\d+$/ })
      .sort({ purchaseId: -1 })
      .collation({ locale: "en", numericOrdering: true });

    // Check if an invoice was found
    if (billing) {
      res.json(billing.purchaseId);
    } else {
      const billing = await Purchase.find()
      .sort({ purchaseId: -1 })
      .collation({ locale: "en", numericOrdering: true });
    const newId = "KP0"
      res.json(newId);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching last order' });
  }
});



purchaseRouter.get('/purchaseinfo', async (req, res) => {
  const page = parseFloat(req.query.page) || 1; // Default to page 1
  const limit = parseFloat(req.query.limit) || 3; // Default to 10 items per page

  try {
    const totalBillings = await Purchase.countDocuments(); // Get total billing count
    const purchases = await Purchase.find()
      .sort({ billingDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      purchases,
      totalPages: Math.ceil(totalBillings / limit),
      currentPage: page,
      totalPurchases: totalBillings
    });
  } catch (error) {
    console.error("Error fetching billings:", error);
    res.status(500).json({ message: "Error fetching billings" });
  }
});


purchaseRouter.get('/sort/purchase-report', async (req, res) => {
  try {
    const {
      fromDate,
      toDate,
      sellerName,
      invoiceNo,
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

    // Filter by seller name
    if (sellerName) {
      filter.sellerName = { $regex: sellerName, $options: 'i' };
    }

    // Filter by invoice number
    if (invoiceNo) {
      filter.invoiceNo = { $regex: invoiceNo, $options: 'i' };
    }

    // Filter by item name
    if (itemName) {
      filter['items.name'] = { $regex: itemName, $options: 'i' };
    }

    // Filter by amount threshold
    if (amountThreshold) {
      filter['totals.totalPurchaseAmount'] = {
        $gte: parseFloat(amountThreshold),
      };
    }

    // Sorting
    let sort = {};
    if (sortField) {
      sort[sortField] = sortDirection === 'asc' ? 1 : -1;
    } else {
      sort = { invoiceDate: -1 }; // Default sorting
    }

    // Fetch purchases with filters and sorting
    const purchases = await Purchase.find(filter).sort(sort);

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ message: 'Server error' });
  }
});




export default purchaseRouter;