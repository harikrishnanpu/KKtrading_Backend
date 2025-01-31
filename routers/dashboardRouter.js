import express from 'express';
import Billing from '../models/billingModal.js';
import Purchase from '../models/purchasemodals.js';
import SupplierAccount from '../models/supplierAccountModal.js';
import Product from '../models/productModel.js';
import Damage from '../models/damageModal.js';
import Return from '../models/returnModal.js';



const dashboardRouter = express.Router();

dashboardRouter.get('/default/summary', async (req, res) => {
  const totalBills = await Billing.countDocuments();
  const totalCustomers = await Billing.distinct('customerId').then((customers) => customers.length);
  const totalPaid = await Billing.aggregate([
    { $group: { _id: null, total: { $sum: '$billingAmountReceived' } } },
  ]).then((res) => (res[0] ? res[0].total : 0));
  const totalPending = await Billing.aggregate([
    {
      $group: {
        _id: null,
        totalPending: { $sum: { $subtract: ['$grandTotal', '$billingAmountReceived'] } },
      },
    },
  ]).then((res) => (res[0] ? res[0].totalPending : 0));
  const mostSoldItems = await Billing.aggregate([
    { $unwind: '$products' },
    {
      $group: {
        _id: '$products.name',
        totalQuantity: { $sum: '$products.quantity' },
      },
    },
    { $sort: { totalQuantity: -1 } },
    { $limit: 5 },
  ]);

  return res.json({
    totalBills,
    totalCustomers,
    totalPaid,
    totalPending,
    mostSoldItems,
});

});


dashboardRouter.get('/invoice/dashboard/summary', async (req, res) => {
  try {
    // Read period from query. Default to 'monthly' if none given.
    const period = req.query.period || 'monthly';

    const allBillings = await Billing.find();

    // ========== 1) Calculate totals for the Widget Cards ==========
    let totalAmount = 0;
    let paidAmount = 0;
    let pendingAmount = 0;
    let overdueAmount = 0;

    allBillings.forEach((bill) => {
      const { grandTotal, deliveryStatus, paymentStatus } = bill;
      totalAmount += grandTotal || 0;

      if (paymentStatus === 'Paid') {
        paidAmount += grandTotal || 0;
      }

      // If not delivered => consider it "Pending" for the widget logic
      if (deliveryStatus !== 'Delivered') {
        pendingAmount += grandTotal || 0;
      }

      // "Overdue": specifically "Delivered but not fully paid"
      if (deliveryStatus === 'Delivered' && paymentStatus !== 'Paid') {
        overdueAmount += grandTotal || 0;
      }
    });

    // ========== 2) Build the chart series data by (salesman vs. month/week) ==========

    // We'll group by { salesmanName, periodKey } summing up grandTotal.
    // If period === 'monthly', periodKey = "YYYY-MM".
    // If period === 'weekly', periodKey = "YYYY-Wxx" (some representation of the year-week).
    
    const aggregatedData = {}; 
    // structure: {
    //   salesmanName: {
    //     [periodKey]: sumOfGrandTotals
    //   },
    //   ...
    // }

    allBillings.forEach((bill) => {
      const { salesmanName, grandTotal, invoiceDate } = bill;
      const dateObj = new Date(invoiceDate);

      let periodKey;
      if (period === 'weekly') {
        // Get ISO week number
        // Example: "2023-W01", "2023-W02", etc.
        const year = dateObj.getFullYear();
        // a small helper to get ISO week number
        const oneJan = new Date(year, 0, 1);
        const numberOfDays = Math.floor((dateObj - oneJan) / (24 * 60 * 60 * 1000));
        const week = Math.ceil((dateObj.getDay() + 1 + numberOfDays) / 7);
        periodKey = `${year}-W${String(week).padStart(2, '0')}`;
      } else {
        // Default 'monthly'
        const month = dateObj.getMonth() + 1; // 1-based
        const year = dateObj.getFullYear();
        periodKey = `${year}-${String(month).padStart(2, '0')}`;
      }

      if (!aggregatedData[salesmanName]) {
        aggregatedData[salesmanName] = {};
      }
      if (!aggregatedData[salesmanName][periodKey]) {
        aggregatedData[salesmanName][periodKey] = 0;
      }

      aggregatedData[salesmanName][periodKey] += grandTotal;
    });

    // Step 2: gather all distinct periodKeys across all salesmen
    const allPeriodKeys = new Set();
    Object.values(aggregatedData).forEach((map) => {
      Object.keys(map).forEach((pk) => allPeriodKeys.add(pk));
    });

    // Sort them in ascending order
    // For months "YYYY-MM" lexical sort works well.
    // For weeks "YYYY-Wxx", also generally works if your data is within a single (or near) year
    // but for best reliability you might parse them. We'll keep it simple here:
    const sortedPeriodKeys = Array.from(allPeriodKeys).sort();

    // Step 3: Convert aggregatedData into ApexCharts-like structure
    const chartData = [];
    Object.keys(aggregatedData).forEach((salesmanName, idx) => {
      const type = idx % 2 === 0 ? 'column' : 'line'; // alternate or choose all 'column'

      const data = sortedPeriodKeys.map((key) => {
        return aggregatedData[salesmanName][key] || 0;
      });

      chartData.push({
        name: salesmanName,
        type,
        data
      });
    });

    // ========== 3) Build widget data structure ==========
    // If you want to compute monthly or weekly differences (profit/loss %),
    // you could do that here. For simplicity, set them all to 0 or some placeholder:
    const widgetData = [
      {
        title: 'Total',
        count: totalAmount,
        percentage: 0, 
        isLoss: false,
        invoice: '',
        color: '#ed6c02'
      },
      {
        title: 'Paid',
        count: paidAmount,
        percentage: 0, 
        isLoss: false,
        invoice: '',
        color: '#d32f2f'
      },
      {
        title: 'Pending',
        count: pendingAmount,
        percentage: 0,
        isLoss: false,
        invoice: '',
        color: '#2e7d32'
      },
      {
        title: 'Overdue',
        count: overdueAmount,
        percentage: 0,
        isLoss: true,
        invoice: '',
        color: '#1976d2'
      }
    ];

    // Return the results
    return res.json({
      widgetData,
      chartData,
      sortedMonthKeys: sortedPeriodKeys // or rename to sortedPeriodKeys
    });
  } catch (error) {
    console.error('Error in GET /invoice/dashboard/summary:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});



dashboardRouter.get('/purchase/dashboard/summary', async (req, res) => {
  try {
    // 1. Read period from query. Default to 'monthly' if none given.
    const period = req.query.period || 'monthly';

    // 2. Fetch all Purchase and SupplierAccount data
    const [allPurchases, allSupplierAccounts] = await Promise.all([
      Purchase.find(),
      SupplierAccount.find(),
    ]);

    // ========== 1) Calculate totals for the Widget Cards ==========
    // Calculate Total Amount from Purchases
    const totalAmount = allPurchases.reduce((sum, purchase) => {
      return sum + (purchase.totals?.totalPurchaseAmount || 0);
    }, 0);

    // Calculate Paid Amount and Pending Amount from SupplierAccounts
    const paidAmount = allSupplierAccounts.reduce((sum, account) => {
      return sum + (account.paidAmount || 0);
    }, 0);

    const pendingAmount = allSupplierAccounts.reduce((sum, account) => {
      return sum + (account.pendingAmount || 0);
    }, 0);

    // Overdue Amount is set to 0 as per your requirement
    const overdueAmount = 0;

    // ========== 2) Build the chart series data by (sellerName vs. month/week) ==========
    // Group by { sellerName, periodKey } summing up totalPurchaseAmount.
    const aggregatedData = {};
    // Structure:
    // {
    //   sellerName: {
    //     [periodKey]: sumOfTotalPurchaseAmounts
    //   },
    //   ...
    // }

    allPurchases.forEach((purchase) => {
      const { sellerName, totals, invoiceDate } = purchase;
      const dateObj = new Date(invoiceDate);

      let periodKey;
      if (period === 'weekly') {
        // Get ISO week number
        const year = dateObj.getFullYear();
        const oneJan = new Date(year, 0, 1);
        const numberOfDays = Math.floor((dateObj - oneJan) / (24 * 60 * 60 * 1000));
        const week = Math.ceil((dateObj.getDay() + 1 + numberOfDays) / 7);
        periodKey = `${year}-W${String(week).padStart(2, '0')}`;
      } else {
        // Default 'monthly'
        const month = dateObj.getMonth() + 1; // 1-based
        const year = dateObj.getFullYear();
        periodKey = `${year}-${String(month).padStart(2, '0')}`;
      }

      if (!aggregatedData[sellerName]) {
        aggregatedData[sellerName] = {};
      }
      if (!aggregatedData[sellerName][periodKey]) {
        aggregatedData[sellerName][periodKey] = 0;
      }

      aggregatedData[sellerName][periodKey] += totals?.totalPurchaseAmount || 0;
    });

    // Step 2: Gather all distinct periodKeys across all sellers
    const allPeriodKeys = new Set();
    Object.values(aggregatedData).forEach((map) => {
      Object.keys(map).forEach((pk) => allPeriodKeys.add(pk));
    });

    // Sort them in ascending order
    const sortedPeriodKeys = Array.from(allPeriodKeys).sort();

    // Step 3: Convert aggregatedData into ApexCharts-like structure
    const chartData = [];
    Object.keys(aggregatedData).forEach((sellerName, idx) => {
      const type = idx % 2 === 0 ? 'column' : 'line'; // Alternate types or choose as needed

      const data = sortedPeriodKeys.map((key) => {
        return aggregatedData[sellerName][key] || 0;
      });

      chartData.push({
        name: sellerName,
        type,
        data,
      });
    });

    // ========== 3) Build widget data structure ==========
    const widgetData = [
      {
        title: 'Total Purchase Amount',
        count: totalAmount,
        percentage: 0, // Placeholder or compute as needed
        isLoss: false,
        invoice: '',
        color: '#ed6c02',
      },
      {
        title: 'Paid',
        count: paidAmount,
        percentage: 0, // Placeholder or compute as needed
        isLoss: false,
        invoice: '',
        color: '#d32f2f',
      },
      {
        title: 'Pending',
        count: pendingAmount,
        percentage: 0, // Placeholder or compute as needed
        isLoss: false,
        invoice: '',
        color: '#2e7d32',
      },
      {
        title: 'Overdue',
        count: overdueAmount,
        percentage: 0, // Since it's always 0
        isLoss: true,
        invoice: '',
        color: '#1976d2',
      },
    ];

    // ========== 4) Return the results ==========
    return res.json({
      widgetData,
      chartData,
      sortedPeriodKeys, // Renamed for clarity
    });
  } catch (error) {
    console.error('Error in GET /invoice/dashboard/summary:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});



dashboardRouter.get('/invoice/dashboard/recent', async (req, res) => {
  try {
    // Fetch the most recent 5 invoices, sorted by invoiceDate descending
    const recentInvoices = await Billing.find({isApproved: true})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('invoiceNo customerName grandTotal paymentStatus invoiceDate');

    // Format the data if necessary
    const formattedInvoices = recentInvoices.map((invoice) => ({
      invoiceNo: invoice.invoiceNo,
      customerName: invoice.customerName,
      grandTotal: invoice.grandTotal,
      paymentStatus: invoice.paymentStatus,
      invoiceDate: invoice.invoiceDate,
    }));

    return res.json({ invoices: formattedInvoices });
  } catch (error) {
    console.error('Error fetching recent invoices:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});


dashboardRouter.get('/purchase/dashboard/recent', async (req, res) => {
  try {
    // Fetch the most recent 5 invoices, sorted by invoiceDate descending
    const recentInvoices = await Purchase.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('invoiceNo sellerName totals.totalPurchaseAmount invoiceDate');

    // Format the data if necessary
    const formattedInvoices = recentInvoices.map((invoice) => ({
      invoiceNo: invoice.invoiceNo,
      supplierName: invoice.sellerName,
      purchaseAmount: invoice.totals.totalPurchaseAmount,
      invoiceDate: invoice.invoiceDate,
    }));

    return res.json({ invoices: formattedInvoices });
  } catch (error) {
    console.error('Error fetching recent invoices:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});


dashboardRouter.get('/invoice/dashboard/pie-chart', async (req, res) => {
  try {
    const now = new Date();

    const summary = await Billing.aggregate([
      {
        $facet: {
          Pending: [
            { $match: { paymentStatus: 'Unpaid', isApproved: true } },
            { $count: 'count' },
          ],
          Paid: [
            { $match: { paymentStatus: 'Paid' } },
            { $count: 'count' },
          ],
          Overdue: [
            {
              $match: {
                $or: [
                  { paymentStatus: 'Partial' },
                  { expectedDeliveryDate: { $lt: now }, paymentStatus: { $ne: 'Paid' } },
                ],
              },
            },
            { $count: 'count' },
          ],
          Draft: [
            { $match: { isApproved: false } },
            { $count: 'count' },
          ],
        },
      },
      {
        $project: {
          Pending: { $arrayElemAt: ['$Pending.count', 0] },
          Paid: { $arrayElemAt: ['$Paid.count', 0] },
          Overdue: { $arrayElemAt: ['$Overdue.count', 0] },
          Draft: { $arrayElemAt: ['$Draft.count', 0] },
        },
      },
    ]);

    const result = summary[0] || { Pending: 0, Paid: 0, Overdue: 0, Draft: 0 };

    // Calculate total for percentage
    const total = result.Pending + result.Paid + result.Overdue + result.Draft || 1;

    // Prepare data with percentages
    const data = {
      Pending: ((result.Pending || 0 / total) * 100).toFixed(2),
      Paid: ((result.Paid || 0 / total) * 100).toFixed(2),
      Overdue: ((result.Overdue || 0 / total) * 100).toFixed(2),
      Draft: ((result.Draft || 0 / total) * 100).toFixed(2),
    };

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching status summary:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});


dashboardRouter.get('/purchase/dashboard/pie-chart', async (req, res) => {
  try {
    const now = new Date();

    const summary = await Purchase.aggregate([
      // 1. Join with SupplierAccount based on sellerId
      {
        $lookup: {
          from: 'supplieraccounts', // Ensure this matches the actual collection name in MongoDB
          localField: 'sellerId',
          foreignField: 'sellerId',
          as: 'supplierAccount',
        },
      },
      // 2. Unwind the supplierAccount array to de-normalize
      { $unwind: '$supplierAccount' },
      // 3. Add necessary fields for aggregation
      {
        $addFields: {
          paidAmount: '$supplierAccount.paidAmount',
          pendingAmount: '$supplierAccount.pendingAmount',
          totalPurchaseAmount: '$totals.totalPurchaseAmount',
          isApproved: '$isApproved', // Assuming this field exists in the Purchase model
        },
      },
      // 4. Determine the status flags for each purchase
      {
        $project: {
          isDraft: {
            $cond: [{ $eq: ['$isApproved', false] }, 1, 0],
          },
          isPaid: {
            $cond: [
              { $gte: ['$paidAmount', '$totalPurchaseAmount'] },
              1,
              0,
            ],
          },
          isPending: {
            $cond: [{ $gt: ['$pendingAmount', 0] }, 1, 0],
          },
          // Overdue is always 0 as per requirement
          isOverdue: 0,
        },
      },
      // 5. Group to calculate the counts for each category
      {
        $group: {
          _id: null,
          Draft: { $sum: '$isDraft' },
          Paid: { $sum: '$isPaid' },
          Pending: { $sum: '$isPending' },
          Overdue: { $sum: '$isOverdue' }, // Will always be 0
        },
      },
    ]);

    // Extract the result or set defaults
    const result = summary[0] || {
      Draft: 0,
      Paid: 0,
      Pending: 0,
      Overdue: 0,
    };

    // Calculate the total for percentage computation
    const total =
      (result.Pending || 0) +
      (result.Paid || 0) +
      (result.Draft || 0) +
      (result.Overdue || 0) ||
      1; // Prevent division by zero

    // Prepare the data with correct percentage calculations
    const data = {
      Pending: (((result.Pending || 0) / total) * 100).toFixed(2),
      Paid: (((result.Paid || 0) / total) * 100).toFixed(2),
      Overdue: (((result.Overdue || 0) / total) * 100).toFixed(2),
      Draft: (((result.Draft || 0) / total) * 100).toFixed(2),
    };

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching pie-chart summary:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

dashboardRouter.get('/purchase/dashboard/summary', async (req, res) => {
  try {
    // Read period from query. Default to 'monthly' if none given.
    const period = req.query.period || 'monthly';
    const now = new Date();

    const allPurchases = await Purchase.find();

    // ========== 1) Calculate totals for the Widget Cards ==========
    let totalPurchaseAmount = 0;
    let paidAmount = 0;
    let pendingAmount = 0;
    let overdueAmount = 0;

    allPurchases.forEach((purchase) => {
      const { totals, transportationDetails } = purchase;
      const { grandTotalPurchaseAmount, paymentStatus, expectedDeliveryDate } = purchase; // Adjust fields as per your schema
      // Assuming `paymentStatus` and `expectedDeliveryDate` exist in Purchase model. If not, adjust accordingly.

      // Total Purchase Amount
      totalPurchaseAmount += totals.grandTotalPurchaseAmount || 0;

      // Paid Amount (Assuming you have payment status in Purchase)
      if (purchase.paymentStatus === 'Paid') {
        paidAmount += totals.grandTotalPurchaseAmount || 0;
      }

      // Pending Amount
      if (purchase.paymentStatus !== 'Paid') {
        pendingAmount += totals.grandTotalPurchaseAmount || 0;
      }

      // Overdue Amount: Assuming there's a due date field to compare
      // If Purchase model doesn't have `dueDate`, adjust accordingly
      if (purchase.paymentStatus === 'Partial' || (purchase.expectedDeliveryDate && purchase.expectedDeliveryDate < now)) {
        overdueAmount += totals.grandTotalPurchaseAmount || 0;
      }
    });

    // ========== 2) Build the chart series data by (supplier vs. month/week) ==========
    // We'll group by { sellerName, periodKey } summing up grandTotalPurchaseAmount.
    // If period === 'weekly', periodKey = "YYYY-Wxx".
    // If period === 'monthly', periodKey = "YYYY-MM".

    const aggregatedData = {};
    // Structure: {
    //   sellerName: {
    //     [periodKey]: sumOfGrandTotalPurchaseAmount
    //   },
    //   ...
    // }

    allPurchases.forEach((purchase) => {
      const { sellerName, totals, invoiceDate } = purchase;
      const dateObj = new Date(invoiceDate);

      let periodKey;
      if (period === 'weekly') {
        // Get ISO week number
        const year = dateObj.getFullYear();
        const oneJan = new Date(year, 0, 1);
        const numberOfDays = Math.floor((dateObj - oneJan) / (24 * 60 * 60 * 1000));
        const week = Math.ceil((dateObj.getDay() + 1 + numberOfDays) / 7);
        periodKey = `${year}-W${String(week).padStart(2, '0')}`;
      } else {
        // Default 'monthly'
        const month = dateObj.getMonth() + 1; // 1-based
        const year = dateObj.getFullYear();
        periodKey = `${year}-${String(month).padStart(2, '0')}`;
      }

      if (!aggregatedData[sellerName]) {
        aggregatedData[sellerName] = {};
      }
      if (!aggregatedData[sellerName][periodKey]) {
        aggregatedData[sellerName][periodKey] = 0;
      }

      aggregatedData[sellerName][periodKey] += totals.grandTotalPurchaseAmount || 0;
    });

    // Gather all distinct periodKeys across all suppliers
    const allPeriodKeys = new Set();
    Object.values(aggregatedData).forEach((map) => {
      Object.keys(map).forEach((pk) => allPeriodKeys.add(pk));
    });

    // Sort them in ascending order
    const sortedPeriodKeys = Array.from(allPeriodKeys).sort();

    // Convert aggregatedData into ApexCharts-like structure
    const chartData = [];
    Object.keys(aggregatedData).forEach((supplierName, idx) => {
      const type = idx % 2 === 0 ? 'column' : 'line'; // Alternate types or choose all 'column'

      const data = sortedPeriodKeys.map((key) => {
        return aggregatedData[supplierName][key] || 0;
      });

      chartData.push({
        name: supplierName,
        type,
        data,
      });
    });

    // ========== 3) Build widget data structure ==========
    const widgetData = [
      {
        title: 'Total Purchase',
        count: totalPurchaseAmount,
        percentage: 0, // Placeholder or calculate if needed
        isLoss: false,
        invoice: '',
        color: '#1565c0', // Choose appropriate colors
      },
      {
        title: 'Paid',
        count: paidAmount,
        percentage: 0,
        isLoss: false,
        invoice: '',
        color: '#2e7d32',
      },
      {
        title: 'Pending',
        count: pendingAmount,
        percentage: 0,
        isLoss: false,
        invoice: '',
        color: '#ed6c02',
      },
      {
        title: 'Overdue',
        count: overdueAmount,
        percentage: 0,
        isLoss: true,
        invoice: '',
        color: '#d32f2f',
      },
    ];

    // Return the results
    return res.json({
      widgetData,
      chartData,
      sortedPeriodKeys, // Rename if necessary
    });
  } catch (error) {
    console.error('Error in GET /purchase/dashboard/summary:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});


/**
 * Helper: fills an array of 12 months [Jan..Dec] with 0 or the actual count
 * so that if any month is missing from the aggregation, it becomes 0
 */
function fillMonthlyData(aggregateData) {
  // aggregateData example: [ { _id: { year: 2023, month: 1 }, count: 5 }, { _id: { year: 2023, month: 3 }, count: 10 }, ...]
  // We'll fill an array of length 12 for months 1..12
  const monthlyArray = new Array(12).fill(0);

  aggregateData.forEach((item) => {
    const monthIndex = item._id.month - 1; // e.g. if month=1 => index=0
    monthlyArray[monthIndex] = item.count;
  });

  return monthlyArray;
}

dashboardRouter.get('/dashboard/dashboard-stats', async (req, res) => {
  try {
    // =============== BILLS ===============
    const totalBills = await Billing.countDocuments({});
    // Monthly bills (group by year+month on createdAt)
    const monthlyBillsRaw = await Billing.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      }
    ]);
    const monthlyBills = fillMonthlyData(monthlyBillsRaw);

    // =============== PURCHASES ===============
    const totalPurchases = await Purchase.countDocuments({});
    // Monthly purchases (createdAt in Purchase schema)
    const monthlyPurchasesRaw = await Purchase.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      }
    ]);
    const monthlyPurchases = fillMonthlyData(monthlyPurchasesRaw);

    // =============== RETURNS ===============
    const totalReturns = await Return.countDocuments({});
    const monthlyReturnsRaw = await Return.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      }
    ]);
    const monthlyReturns = fillMonthlyData(monthlyReturnsRaw);

    // =============== DAMAGES ===============
    const totalDamages = await Damage.countDocuments({});
    const monthlyDamagesRaw = await Damage.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      }
    ]);
    const monthlyDamages = fillMonthlyData(monthlyDamagesRaw);

    // =============== LOW STOCK ===============
    // All products with countInStock < 5
    const totalLowStock = await Product.countDocuments({ countInStock: { $lt: 5 } });
    // (Optional) monthly logic for low stock:
    // This is tricky because "low stock" is a state, not a creation event.
    // The naive approach is to track how many products were created each month with < 5 stock
    const monthlyLowStockRaw = await Product.aggregate([
      { $match: { countInStock: { $lt: 5 } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      }
    ]);
    const monthlyLowStock = fillMonthlyData(monthlyLowStockRaw);

    // =============== DELIVERIES ===============
    // Each Billing document can have an array of deliveries
    // We want total deliveries across all Billings.
    // Summation of deliveries arrays length
    // e.g., if one Billing has 2 deliveries, another has 3, total = 5
    const deliveriesSum = await Billing.aggregate([
      {
        $project: {
          deliveryCount: { $size: '$deliveries' }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$deliveryCount' }
        }
      }
    ]);
    const totalDeliveries = deliveriesSum.length ? deliveriesSum[0].total : 0;

    // monthly deliveries: We can group by the Billing's createdAt
    // i.e. how many deliveries belong to bills that started in that month
    // This is approximate. If you want the actual creation date of each
    // delivery, you'd need a createdAt field inside deliveries sub-doc.
    const monthlyDeliveriesRaw = await Billing.aggregate([
      {
        $project: {
          // we simply turn each doc into (# of deliveries, year, month)
          count: { $size: '$deliveries' },
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        }
      },
      {
        $group: {
          _id: {
            year: '$year',
            month: '$month'
          },
          count: { $sum: '$count' }
        }
      }
    ]);
    const monthlyDeliveries = fillMonthlyData(monthlyDeliveriesRaw);

    // Prepare response object
    const stats = {
      totalBills,
      monthlyBills,
      totalPurchases,
      monthlyPurchases,
      totalReturns,
      monthlyReturns,
      totalDamages,
      monthlyDamages,
      totalLowStock,
      monthlyLowStock,
      totalDeliveries,
      monthlyDeliveries
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error in /dashboard-stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


export default dashboardRouter;