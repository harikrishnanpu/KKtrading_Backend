import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import data from '../data.js';
import Product from '../models/productModel.js';
import User from '../models/userModel.js';
import { isAdmin, isAuth } from '../utils.js';
import asyncHandler from 'express-async-handler';
import Purchase from '../models/purchasemodals.js';
import SellerPayment from '../models/sellerPayments.js';
import TransportPayment from '../models/transportPayments.js';
import SupplierAccount from '../models/supplierAccountModal.js';
import Transportation from '../models/transportModal.js';
import Billing from '../models/billingModal.js';
import Return from '../models/returnModal.js';
import Damage from '../models/damageModal.js';
import StockOpening from '../models/stockOpeningModal.js';


const productRouter = express.Router();

productRouter.get('/',
  expressAsyncHandler(async (req, res) => {
    const pageSize = 20;
    const page = Number(req.query.pageNumber) || 1;
    const name = req.query.name ? req.query.name.toUpperCase() : '';
    const category = req.query.category ? req.query.category.toUpperCase() : '';
    const brand = req.query.brand ? req.query.brand.toUpperCase() : '';
    const size = req.query.size ? req.query.size.toUpperCase() : '';
    const order = req.query.order ? req.query.order.toLowerCase() : '';
    const min = req.query.min && Number(req.query.min) !== 0 ? Number(req.query.min) : 0;
    const max = req.query.max && Number(req.query.max) !== 0 ? Number(req.query.max) : 0;
    const rating = req.query.rating && Number(req.query.rating) !== 0 ? Number(req.query.rating) : 0;
    const inStock = req.query.inStock;
    const countInStockMin = req.query.countInStockMin
      ? Number(req.query.countInStockMin)
      : 0;

    const nameFilter = name && name !== 'ALL' ? { name: { $regex: name, $options: 'i' } } : {};
    const categoryFilter = category && category !== 'ALL' ? { category } : {};
    const brandFilter = brand && brand !== 'ALL' ? { brand } : {};
    const sizeFilter = size && size !== 'ALL' ? { size } : {};
    const priceFilter =
      min !== 0 || max !== 0
        ? { price: { ...(min !== 0 ? { $gte: min } : {}), ...(max !== 0 ? { $lte: max } : {}) } }
        : {};
    const ratingFilter = rating ? { rating: { $gte: rating } } : {};
    const inStockFilter =
      inStock === 'true'
        ? { countInStock: { $gt: 0 } }
        : {};
    const countInStockMinFilter =
      countInStockMin > 0 ? { countInStock: { $gte: countInStockMin } } : {};

    const sortOrder =
      order === 'lowest'
        ? { price: 1 }
        : order === 'highest'
        ? { price: -1 }
        : order === 'toprated'
        ? { rating: -1 }
        : order === 'countinstock'
        ? { countInStock: -1 }
        : { _id: -1 };

    try {
      const totalProducts = await Product.countDocuments({
        ...nameFilter,
        ...categoryFilter,
        ...brandFilter,
        ...sizeFilter,
        ...priceFilter,
        ...ratingFilter,
        ...inStockFilter,
        ...countInStockMinFilter,
      });

      const products = await Product.find({
        ...nameFilter,
        ...categoryFilter,
        ...brandFilter,
        ...sizeFilter,
        ...priceFilter,
        ...ratingFilter,
        ...inStockFilter,
        ...countInStockMinFilter,
      })
        .sort(sortOrder)
        .skip(pageSize * (page - 1))
        .limit(pageSize);

      res.send({
        products,
        page,
        totalProducts,
        pages: Math.ceil(totalProducts / pageSize),
      });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  })
);

// Additional routes to get categories, brands, and sizes
productRouter.get(
  '/categories',
  expressAsyncHandler(async (req, res) => {
    const categories = await Product.find().distinct('category');
    res.send(categories);
  })
);

productRouter.get(
  '/brands',
  expressAsyncHandler(async (req, res) => {
    const brands = await Product.find().distinct('brand');
    res.send(brands);
  })
);

productRouter.get(
  '/sizes',
  expressAsyncHandler(async (req, res) => {
    const sizes = await Product.find().distinct('size');
    res.send(sizes);
  })
);


productRouter.get('/searchform/search', async (req, res) => {
  let searchQuery = (req.query.q || '').trim();
  const limit = parseFloat(req.query.limit) || 8;

  try {
    let products = [];

    // Check if the search query matches the pattern for an item ID (starts with 'K' followed by numbers)
    const isItemId = /^K\d+$/i.test(searchQuery);

    if (isItemId) {
      // Search for the product by item ID (exact match)
      const product = await Product.findOne({ item_id: searchQuery.toUpperCase() });
      if (product) {
        products.push(product);
      } else {
        return res.status(404).json({ message: 'No product found with the specified item ID' });
      }
    } else {
      // Split the search query into words and create a regex pattern for each
      const searchTerms = searchQuery.split(/\s+/).map(term => new RegExp(term, 'i'));

      // Find products where all search terms match in the `name` field
      products = await Product.find({
        $and: searchTerms.map(term => ({ name: { $regex: term } }))
      }).limit(limit);

      if (products.length === 0) {
        return res.status(404).json({ message: 'No products match your search query' });
      }
    }

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
});



// Route to get product by item ID
productRouter.get('/itemId/:itemId', async (req, res) => {
  try {
    const itemId = req.params.itemId.toUpperCase();

    // Search for the product by item_id (case-insensitive)
    let product = await Product.findOne({ item_id: itemId });

    // If no product is found with item_id, search by name
    if (!product) {
      product = await Product.findOne({ name: { $regex: itemId, $options: 'i' } });
    }

    // If still no product is found, return a 404 error
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Return the found product
    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});


productRouter.get('/search/itemId', async (req, res) => {
  try {
    const query = req.query.query.toUpperCase();
    // Regex to match item IDs starting with 'K' followed by 1 to 4 digits
    const isItemId = /^K\d{1,4}$/.test(query);

    let products;
    
    if (isItemId) {
      // If the query is an item ID, find the specific product
      products = await Product.find({ item_id: query }).limit(1);
    } else {
      // If the query is a name, perform a regex search
      const regex = new RegExp(query, 'i');  // Case-insensitive regex search
      products = await Product.find({ 
        $or: [
          { name: regex } 
        ] 
      }).limit(8); // Limit the number of suggestions
    }

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error });
  }
});


productRouter.get('/admin/categories', async (req, res) => {
  try {
    const categories = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
    ]);

    res.json(
      categories.map((category) => ({
        name: category._id,
        count: category.count,
      }))
    );
  } catch (error) {
    console.error('Error fetching product categories:', error);
    res.status(500).json({ message: 'Error fetching product categories' });
  }
});








productRouter.get(
  '/seed',
  expressAsyncHandler(async (req, res) => {
    // await Product.remove({});
    const seller = await User.findOne({ isSeller: true });
    if (seller) {
      const products = data.products.map((product) => ({
        ...product,
        seller: seller._id,
      }));
      const createdProducts = await Product.insertMany(products);
      res.send({ createdProducts });
    } else {
      res
        .status(500)
        .send({ message: 'No seller found. first run /api/users/seed' });
    }
  })
);

productRouter.get(
  '/:id',
  expressAsyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id).populate(
      'seller',
      'seller.name seller.logo seller.rating seller.numReviews'
    );
    if (product) {
      res.send(product);
    } else {
      res.status(404).send({ message: 'Product Not Found' });
    }
  })
);

productRouter.post(
  '/',
  expressAsyncHandler(async (req, res) => {

    try{
    const product = new Product({
      name: 'Sample name ' + Date.now().toString(),
      item_id: Date.now(),
      seller: 'Supplier',
      image: '/images/',
      price: 0,
      category: 'Category',
      brand: 'Brand',
      countInStock: 0,
      psRatio: 0,
      pUnit: 'BOX',
      sUnit: 'NOS',
      length: 0,
      breadth: 0,
      size: 'size',
      unit: 'unit',
      rating: 0,
      numReviews: 0,
      description: 'Sample description',
    });
    const createdProduct = await product.save();
    res.status(201).send(createdProduct);

  }catch (error){
    console.log("error creating product", error)
    res.status(500).json({ message: 'Error creating product' });
  }
  })
);


// Update a product
productRouter.put('/get-item/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Error updating product' });
  }
});

productRouter.put('/update-stock/:id', async (req, res) => {
  const { countInStock, userName } = req.body; // Extract countInStock from the request body

  try {
    // Check if countInStock is a valid number (float or integer)
    if (typeof countInStock !== 'number' || isNaN(countInStock)) {
      return res.status(400).json({ message: 'Invalid countInStock value' });
    }

    // Use $inc to add the countInStock value (can be a float)
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $inc: { countInStock } },
      { new: true }
    );

    // Check if the product was found
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }


      // Create log entry
  const logEntry = new StockOpening({
    item_id: product.item_id,
    name: product.name,
    quantity: countInStock,
    submittedBy: userName,
    remark: 'Bill Opening',
    date: new Date(),
  });

  await logEntry.save();

    res.json(product);
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: 'Error updating product stock' });
  }
});


productRouter.put(
  '/:id',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    if (product) {
      product.name = req.body.name;
      product.price = req.body.price;
      product.image = req.body.image;
      product.category = req.body.category;
      product.brand = req.body.brand;
      product.countInStock = req.body.countInStock;
      product.description = req.body.description;
      product.item_id = req.body.itemId;
      product.psRatio = req.body.psRatio;
      product.pUnit = req.body.pUnit;
      product.sUnit = req.body.sUnit;
      product.length = req.body.length;
      product.breadth = req.body.breadth;
      product.size = req.body.size;
      product.unit = req.body.unit;
      product.type = req.body.type;
      product.cashPartPrice = req.body.cashPartPrice;
      product.billPartPrice = req.body.billPartPrice;
      const updatedProduct = await product.save();
      res.send({ message: 'Product Updated', product: updatedProduct });
    } else {
      res.status(404).send({ message: 'Product Not Found' });
    }
  })
);

productRouter.delete(
  '/:id',
  expressAsyncHandler(async (req, res) => {
    try {
      const product = await Product.findByIdAndDelete(req.params.id);
      if (!product) {
        return res.status(404).send({ message: 'Product Not Found' });
      }
      res.send({ message: 'Product Deleted', product });
    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).send({ message: 'Error deleting product', error: error.message });
    }
  })
);


productRouter.post(
  '/:id/reviews',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    if (product) {
      if (product.reviews.find((x) => x.name === req.body.name)) {
        return res
          .status(400)
          .send({ message: 'You already submitted a review' });
      }
      const review = {
        name: req.body.name,
        rating: Number(req.body.rating),
        comment: req.body.comment,
      };
      product.reviews.push(review);
      product.numReviews = product.reviews.length;
      product.rating =
        product.reviews.reduce((a, c) => c.rating + a, 0) /
        product.reviews.length;
      const updatedProduct = await product.save();
      res.status(201).send({
        message: 'Review Created',
        review: updatedProduct.reviews[updatedProduct.reviews.length - 1],
      });
    } else {
      res.status(404).send({ message: 'Product Not Found' });
    }
  })
);


productRouter.post(
  '/purchase',
  asyncHandler(async (req, res) => {
    try {
      const {
        sellerId,
        sellerName,
        items,
        invoiceNo,
        sellerAddress,
        sellerGst,
        billingDate,
        invoiceDate,
        totals,
        transportationDetails,
      } = req.body;

      let { purchaseId } = req.body;

      // 1. Check if Purchase with the same invoiceNo or purchaseId already exists
      let existingPurchase = await Purchase.findOne({
        $or: [{ invoiceNo }, { purchaseId }],
      });

      // Generate new purchaseId if it already exists or not provided
      if (existingPurchase || !purchaseId) {
        const latestPurchase = await Purchase.findOne({ purchaseId: /^KP\d+$/ })
          .sort({ purchaseId: -1 })
          .collation({ locale: 'en', numericOrdering: true });

        if (!latestPurchase) {
          purchaseId = 'KP1';
        } else {
          const latestNumber = parseInt(latestPurchase.purchaseId.replace('KP', ''), 10);
          purchaseId = `KP${latestNumber + 1}`;
        }
      }

      // 2. Adjust product stock and update or create products
      for (const item of items) {
        const product = await Product.findOne({ item_id: item.itemId });
        const quantityInNumbers = parseFloat(item.quantityInNumbers);

        if (product) {
          product.countInStock += quantityInNumbers;
          product.price = parseFloat(item.totalPriceInNumbers);
          product.actLength = item.actLength;
          product.actBreadth = item.actBreadth;
          product.size = item.size;
          product.length = item.length;
          product.breadth = item.breadth;
          product.psRatio = item.psRatio;
          product.name = item.name;
          product.brand = item.brand;
          product.category = item.category;
          product.sUnit = item.sUnit;
          product.pUnit = item.pUnit;
          product.gstPercent = item.gstPercent,
          Object.assign(product, item);
          await product.save();
        } else {
          const newProduct = new Product({
            item_id: item.itemId,
            ...item,
            countInStock: quantityInNumbers,
            price: parseFloat(item.totalPriceInNumbers),
            gstPercent: item.gstPercent,
          });
          await newProduct.save();
        }
      }

      // 3. Save purchase details
      const purchase = new Purchase({
        sellerId,
        sellerName,
        invoiceNo,
        items: items.map((item) => ({ ...item })),
        purchaseId,
        sellerAddress,
        sellerGst,
        billingDate,
        invoiceDate,
        totals,
        transportationDetails,
      });

      await purchase.save();

      // 4. Save transportation details and update TransportPayment
      if (transportationDetails) {
        const { logistic, local, other } = transportationDetails;

        // Logistic Transportation
        if (
          logistic &&
          logistic.transportCompanyName &&
          logistic.transportationCharges !== undefined
        ) {
          const logisticTransport = new Transportation({
            purchaseId,
            invoiceNo: logistic.invoiceNo || invoiceNo,
            transportType: 'logistic',
            companyGst: logistic.companyGst,
            billId: logistic.billId,
            transportCompanyName: logistic.transportCompanyName,
            transportationCharges: parseFloat(logistic.transportationCharges),
            remarks: logistic.remark,
          });

          await logisticTransport.save();

          // Create billing entry for TransportPayment
          const logisticBillingEntry = {
            amount: parseFloat(logistic.transportationCharges),
            date: logistic.billingDate || Date.now(),
            billId: logistic.billId,
            invoiceNo: logistic.invoiceNo || invoiceNo,
          };

          let logisticTransportPayment = await TransportPayment.findOne({
            transportName: logistic.transportCompanyName,
            transportType: 'logistic',
          });

          if (logisticTransportPayment) {
            logisticTransportPayment.billings.push(logisticBillingEntry);
          } else {
            logisticTransportPayment = new TransportPayment({
              transportName: logistic.transportCompanyName,
              transportType: 'logistic',
              transportGst: logistic.transportGst,
              payments: [],
              billings: [logisticBillingEntry],
            });
          }

          logisticTransportPayment.totalAmountBilled = logisticTransportPayment.billings.reduce(
            (sum, billing) => sum + billing.amount,
            0
          );
          logisticTransportPayment.paymentRemaining =
            logisticTransportPayment.totalAmountBilled - logisticTransportPayment.totalAmountPaid;
          await logisticTransportPayment.save();
        }

        // Local Transportation (similar logic)
        // Add code for local transportation if needed


        if (
          local &&
          local.transportCompanyName &&
          local.transportationCharges !== undefined
        ) {
          const localTransport = new Transportation({
            purchaseId,
            invoiceNo: local.invoiceNo || invoiceNo,
            transportType: 'local',
            companyGst: local.companyGst,
            billId: local.billId,
            transportCompanyName: local.transportCompanyName,
            transportationCharges: parseFloat(local.transportationCharges),
            remarks: local.remark,
          });

          await localTransport.save();

          // Create billing entry for TransportPayment
          const localBillingEntry = {
            amount: parseFloat(local.transportationCharges),
            date: local.billingDate || Date.now(),
            billId: local.billId,
            invoiceNo: local.invoiceNo || invoiceNo,
          };

          let localTransportPayment = await TransportPayment.findOne({
            transportName: local.transportCompanyName,
            transportType: 'local',
          });

          if (localTransportPayment) {
            localTransportPayment.billings.push(localBillingEntry);
          } else {
            localTransportPayment = new TransportPayment({
              transportName: local.transportCompanyName,
              transportType: 'local',
              transportGst: local.transportGst,
              payments: [],
              billings: [localBillingEntry],
            });
          }

          localTransportPayment.totalAmountBilled = localTransportPayment.billings.reduce(
            (sum, billing) => sum + billing.amount,
            0
          );
          localTransportPayment.paymentRemaining =
          localTransportPayment.totalAmountBilled - localTransportPayment.totalAmountPaid;
          await localTransportPayment.save();
        }
      }

      // 5. Update or create SellerPayment
      let sellerPayment = await SellerPayment.findOne({ sellerId });

      const billingEntry = {
        amount: totals.totalPurchaseAmount,
        date: billingDate || Date.now(),
        purchaseId,
        invoiceNo,
      };

      if (sellerPayment) {
        sellerPayment.billings.push(billingEntry);
      } else {
        sellerPayment = new SellerPayment({
          sellerId,
          sellerName,
          payments: [],
          billings: [billingEntry],
        });
      }

      sellerPayment.totalAmountBilled = sellerPayment.billings.reduce(
        (sum, billing) => sum + billing.amount,
        0
      );
      sellerPayment.paymentRemaining =
        sellerPayment.totalAmountBilled - sellerPayment.totalAmountPaid;
      await sellerPayment.save();

      // 6. Update or create SupplierAccount
      let supplierAccount = await SupplierAccount.findOne({ sellerId });

      const billEntry = {
        invoiceNo,
        billAmount: totals.totalPurchaseAmount,
        invoiceDate: invoiceDate || Date.now(),
      };

      if (supplierAccount) {
        supplierAccount.bills.push(billEntry);
      } else {
        supplierAccount = new SupplierAccount({
          sellerId,
          sellerName,
          sellerAddress,
          sellerGst,
          bills: [billEntry],
          payments: [],
        });
      }

      supplierAccount.totalBillAmount = supplierAccount.bills.reduce(
        (sum, bill) => sum + bill.billAmount,
        0
      );
      supplierAccount.pendingAmount =
        supplierAccount.totalBillAmount - supplierAccount.paidAmount;
      await supplierAccount.save();

      res.json(purchaseId);
    } catch (error) {
      console.error('Error creating purchase:', error);
      res.status(500).json({ message: 'Error creating purchase', error: error.message });
    }
  })
);


// routes/productRoutes.js (continued)
productRouter.put(
  '/purchase/:purchaseId',
  asyncHandler(async (req, res) => {
    try {
      const { purchaseId } = req.params;
      const {
        sellerId,
        sellerName,
        invoiceNo,
        items,
        sellerAddress,
        sellerGst,
        billingDate,
        invoiceDate,
        totals,
        transportationDetails,
      } = req.body;

      const existingPurchase = await Purchase.findOne({ purchaseId });
      if (!existingPurchase) {
        return res.status(404).json({ message: 'Purchase not found' });
      }

      const oldSellerId = existingPurchase.sellerId;
      const oldInvoiceNo = existingPurchase.invoiceNo;

      // 1. Adjust product stock
      const oldItemMap = new Map();
      for (const item of existingPurchase.items) {
        oldItemMap.set(item.itemId, parseFloat(item.quantityInNumbers));
      }

      for (const item of items) {
        const product = await Product.findOne({ item_id: item.itemId });
        const oldQuantity = oldItemMap.get(item.itemId) || 0;
        const newQuantity = parseFloat(item.quantityInNumbers);

        if (product) {
          product.countInStock += newQuantity - oldQuantity;
          product.actLength = item.actLength;
          product.actBreadth = item.actBreadth;
          product.size = item.size;
          product.length = item.length;
          product.breadth = item.breadth;
          product.psRatio = item.psRatio;
          product.name = item.name;
          product.brand = item.brand;
          product.category = item.category;
          product.sUnit = item.sUnit;
          product.pUnit = item.pUnit;
          product.price = parseFloat(item.totalPriceInNumbers);
          product.gstPercent = item.gstPercent,
          Object.assign(product, item);
          await product.save();
        } else {
          const newProduct = new Product({
            item_id: item.itemId,
            ...item,
            countInStock: newQuantity,
            price: parseFloat(item.totalPriceInNumbers),
            gstPercent: item.gstPercent,
          });
          await newProduct.save();
        }
      }

      // 2. Update purchase details
      existingPurchase.sellerId = sellerId;
      existingPurchase.sellerName = sellerName;
      existingPurchase.invoiceNo = invoiceNo;
      existingPurchase.items = items.map((item) => ({ ...item }));
      existingPurchase.sellerAddress = sellerAddress;
      existingPurchase.sellerGst = sellerGst;
      existingPurchase.billingDate = billingDate || existingPurchase.billingDate;
      existingPurchase.invoiceDate = invoiceDate || existingPurchase.invoiceDate;
      existingPurchase.totals = totals;

      // 3. Update SupplierAccount
      if (oldSellerId !== sellerId) {
        // Remove bill from old supplier
        const oldSupplierAccount = await SupplierAccount.findOne({ sellerId: oldSellerId });
        if (oldSupplierAccount) {
          oldSupplierAccount.bills = oldSupplierAccount.bills.filter(
            (bill) => bill.invoiceNo !== oldInvoiceNo
          );
          oldSupplierAccount.totalBillAmount = oldSupplierAccount.bills.reduce(
            (sum, bill) => sum + bill.billAmount,
            0
          );
          oldSupplierAccount.pendingAmount =
            oldSupplierAccount.totalBillAmount - oldSupplierAccount.paidAmount;
          await oldSupplierAccount.save();
        }

        // Add bill to new supplier
        let newSupplierAccount = await SupplierAccount.findOne({ sellerId });
        const billEntry = {
          invoiceNo,
          billAmount: totals.totalPurchaseAmount,
          invoiceDate: invoiceDate || Date.now(),
        };

        if (newSupplierAccount) {
          newSupplierAccount.bills.push(billEntry);
        } else {
          newSupplierAccount = new SupplierAccount({
            sellerId,
            sellerName,
            sellerAddress,
            sellerGst,
            bills: [billEntry],
            payments: [],
          });
        }

        newSupplierAccount.totalBillAmount = newSupplierAccount.bills.reduce(
          (sum, bill) => sum + bill.billAmount,
          0
        );
        newSupplierAccount.pendingAmount =
          newSupplierAccount.totalBillAmount - newSupplierAccount.paidAmount;
        await newSupplierAccount.save();
      } else {
        // Update bill in the same supplier
        const supplierAccount = await SupplierAccount.findOne({ sellerId });
        if (supplierAccount) {
          const billIndex = supplierAccount.bills.findIndex(
            (bill) => bill.invoiceNo === oldInvoiceNo
          );

          if (billIndex !== -1) {
            supplierAccount.bills[billIndex] = {
              ...supplierAccount.bills[billIndex],
              invoiceNo,
              billAmount: totals.totalPurchaseAmount,
              invoiceDate: invoiceDate || Date.now(),
            };
          } else {
            supplierAccount.bills.push({
              invoiceNo,
              billAmount: totals.totalPurchaseAmount,
              invoiceDate: invoiceDate || Date.now(),
            });
          }

          supplierAccount.totalBillAmount = supplierAccount.bills.reduce(
            (sum, bill) => sum + bill.billAmount,
            0
          );
          supplierAccount.pendingAmount =
            supplierAccount.totalBillAmount - supplierAccount.paidAmount;
          await supplierAccount.save();
        }
      }

      // 4. Update SellerPayment
      if (oldSellerId !== sellerId) {
        // Remove billing from old seller
        const oldSellerPayment = await SellerPayment.findOne({ sellerId: oldSellerId });
        if (oldSellerPayment) {
          oldSellerPayment.billings = oldSellerPayment.billings.filter(
            (billing) => billing.invoiceNo !== oldInvoiceNo
          );
          oldSellerPayment.totalAmountBilled = oldSellerPayment.billings.reduce(
            (sum, billing) => sum + billing.amount,
            0
          );
          oldSellerPayment.paymentRemaining =
            oldSellerPayment.totalAmountBilled - oldSellerPayment.totalAmountPaid;
          await oldSellerPayment.save();
        }

        // Add billing to new seller
        let newSellerPayment = await SellerPayment.findOne({ sellerId });
        const billingEntry = {
          amount: totals.totalPurchaseAmount,
          date: billingDate || new Date(),
          invoiceNo,
          purchaseId,
        };

        if (newSellerPayment) {
          newSellerPayment.billings.push(billingEntry);
        } else {
          newSellerPayment = new SellerPayment({
            sellerId,
            sellerName,
            payments: [],
            billings: [billingEntry],
          });
        }

        newSellerPayment.totalAmountBilled = newSellerPayment.billings.reduce(
          (sum, billing) => sum + billing.amount,
            0
          );
        newSellerPayment.paymentRemaining =
          newSellerPayment.totalAmountBilled - newSellerPayment.totalAmountPaid;
        await newSellerPayment.save();
      } else {
        // Update billing in the same seller
        const sellerPayment = await SellerPayment.findOne({ sellerId });
        if (sellerPayment) {
          const billingIndex = sellerPayment.billings.findIndex(
            (billing) => billing.invoiceNo === oldInvoiceNo
          );

          if (billingIndex !== -1) {
            sellerPayment.billings[billingIndex] = {
              ...sellerPayment.billings[billingIndex],
              amount: totals.totalPurchaseAmount,
              date: billingDate || new Date(),
              purchaseId,
              invoiceNo,
            };
          } else {
            sellerPayment.billings.push({
              amount: totals.totalPurchaseAmount,
              date: billingDate || new Date(),
              purchaseId,
              invoiceNo,
            });
          }

          sellerPayment.totalAmountBilled = sellerPayment.billings.reduce(
            (sum, billing) => sum + billing.amount,
            0
          );
          sellerPayment.paymentRemaining =
            sellerPayment.totalAmountBilled - sellerPayment.totalAmountPaid;
          await sellerPayment.save();
        } else {
          // Create new SellerPayment
          const newSellerPayment = new SellerPayment({
            sellerId,
            sellerName,
            payments: [],
            billings: [
              {
                amount: totals.totalPurchaseAmount,
                date: billingDate || new Date(),
                purchaseId,
                invoiceNo,
              },
            ],
          });

          newSellerPayment.totalAmountBilled = newSellerPayment.billings.reduce(
            (sum, billing) => sum + billing.amount,
            0
          );
          newSellerPayment.paymentRemaining =
            newSellerPayment.totalAmountBilled - newSellerPayment.totalAmountPaid;
          await newSellerPayment.save();
        }
      }

      // 5. Update Transportation and TransportPayment
      // Remove old transportation and transport payments if any
      if (existingPurchase.transportationDetails) {
        const { logistic: oldLogistic, local: oldLocal } = existingPurchase.transportationDetails;

        if (oldLogistic) {
          // Remove from TransportPayment
          const transportPayment = await TransportPayment.findOne({
            transportName: oldLogistic.transportCompanyName,
            transportType: 'logistic',
          });
          
          console.log(oldLogistic)
          if (transportPayment) {
            console.log(transportPayment)
            transportPayment.billings = transportPayment.billings.filter(
              (billing) => billing.billId !== oldLogistic.billId
            );
            transportPayment.totalAmountBilled = transportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            transportPayment.paymentRemaining =
              transportPayment.totalAmountBilled - transportPayment.totalAmountPaid;
            await transportPayment.save();
          }

          // Remove from Transportation
          await Transportation.deleteOne({
            purchaseId,
            transportType: 'logistic',
          });
        }

        if (oldLocal) {
          // Similar code for local transport
          // Remove from TransportPayment and Transportation
          const transportPayment = await TransportPayment.findOne({
            transportName: oldLocal.transportCompanyName,
            transportType: 'local',
          });

          if (transportPayment) {
            transportPayment.billings = transportPayment.billings.filter(
              (billing) => billing.billId !== oldLocal.billId
            );
            transportPayment.totalAmountBilled = transportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            transportPayment.paymentRemaining =
              transportPayment.totalAmountBilled - transportPayment.totalAmountPaid;
            await transportPayment.save();
          }

                    // Remove from Transportation
                    await Transportation.deleteOne({
                      purchaseId,
                      transportType: 'local',
                    });
        }
      }

      // Add new transportation details
      if (transportationDetails) {
        const { logistic, local } = transportationDetails;

        if (
          logistic &&
          logistic.transportCompanyName &&
          logistic.transportationCharges !== undefined
        ) {
          const logisticTransport = new Transportation({
            purchaseId,
            invoiceNo: logistic.invoiceNo || invoiceNo,
            transportType: 'logistic',
            companyGst: logistic.companyGst,
            billId: logistic.billId,
            transportCompanyName: logistic.transportCompanyName,
            transportationCharges: parseFloat(logistic.transportationCharges),
            remarks: logistic.remark,
          });

          await logisticTransport.save();

          const logisticBillingEntry = {
            amount: parseFloat(logistic.transportationCharges),
            date: logistic.billingDate || Date.now(),
            billId: logistic.billId,
            invoiceNo: logistic.invoiceNo || invoiceNo,
          };

          let logisticTransportPayment = await TransportPayment.findOne({
            transportName: logistic.transportCompanyName,
            transportType: 'logistic',
          });

          if (logisticTransportPayment) {
            logisticTransportPayment.billings.push(logisticBillingEntry);
          } else {
            logisticTransportPayment = new TransportPayment({
              transportName: logistic.transportCompanyName,
              transportType: 'logistic',
              transportGst: logistic.transportGst,
              payments: [],
              billings: [logisticBillingEntry],
            });
          }

          logisticTransportPayment.totalAmountBilled = logisticTransportPayment.billings.reduce(
            (sum, billing) => sum + billing.amount,
            0
          );
          logisticTransportPayment.paymentRemaining =
            logisticTransportPayment.totalAmountBilled - logisticTransportPayment.totalAmountPaid;
          await logisticTransportPayment.save();
        }

        if (
          local &&
          local.transportCompanyName &&
          local.transportationCharges !== undefined
        ) {
          const localTransport = new Transportation({
            purchaseId,
            invoiceNo: local.invoiceNo || invoiceNo,
            transportType: 'local',
            companyGst: local.companyGst,
            billId: local.billId,
            transportCompanyName: local.transportCompanyName,
            transportationCharges: parseFloat(local.transportationCharges),
            remarks: local.remark,
          });

          await localTransport.save();

          const localBillingEntry = {
            amount: parseFloat(local.transportationCharges),
            date: local.billingDate || Date.now(),
            billId: local.billId,
            invoiceNo: local.invoiceNo || invoiceNo,
          };

          let localTransportPayment = await TransportPayment.findOne({
            transportName: local.transportCompanyName,
            transportType: 'local',
          });

          if (localTransportPayment) {
            localTransportPayment.billings.push(localBillingEntry);
          } else {
            localTransportPayment = new TransportPayment({
              transportName: local.transportCompanyName,
              transportType: 'local',
              transportGst: local.transportGst,
              payments: [],
              billings: [localBillingEntry],
            });
          }

          localTransportPayment.totalAmountBilled = localTransportPayment.billings.reduce(
            (sum, billing) => sum + billing.amount,
            0
          );
          localTransportPayment.paymentRemaining =
          localTransportPayment.totalAmountBilled - localTransportPayment.totalAmountPaid;
          await localTransportPayment.save();
        }

        // Similar code for local transportation
      }

      existingPurchase.transportationDetails =
      transportationDetails || existingPurchase.transportationDetails;

    await existingPurchase.save();

      res.json({ message: 'Purchase updated successfully' });
    } catch (error) {
      console.error('Error updating purchase:', error);
      res.status(500).json({ message: 'Error updating purchase', error: error.message });
    }
  })
);



productRouter.delete(
  '/purchases/delete/:id',
  asyncHandler(async (req, res) => {
    try {
      const purchase = await Purchase.findById(req.params.id);

      if (!purchase) {
        return res.status(404).json({ message: 'Purchase not found' });
      }

      // Adjust product stock
      for (let item of purchase.items) {
        const product = await Product.findOne({ item_id: item.itemId });

        if (product) {
          product.countInStock -= parseFloat(item.quantityInNumbers);

          if (product.countInStock < 0) {
            product.countInStock = 0; // Ensure stock doesn't go below zero
          }

          await product.save();
        }
      }

      const sellerId = purchase.sellerId;
      const invoiceNo = purchase.invoiceNo;
      const purchaseId = purchase.purchaseId;

      // Remove bill from SupplierAccount
      const supplierAccount = await SupplierAccount.findOne({ sellerId });
      if (supplierAccount) {
        supplierAccount.bills = supplierAccount.bills.filter(
          (bill) => bill.invoiceNo !== invoiceNo
        );
        supplierAccount.totalBillAmount = supplierAccount.bills.reduce(
          (sum, bill) => sum + bill.billAmount,
          0
        );
        supplierAccount.pendingAmount =
          supplierAccount.totalBillAmount - supplierAccount.paidAmount;
        await supplierAccount.save();
      }

      // Remove billing from SellerPayment
      const sellerPayment = await SellerPayment.findOne({ sellerId });
      if (sellerPayment) {
        sellerPayment.billings = sellerPayment.billings.filter(
          (billing) => billing.invoiceNo !== invoiceNo
        );
        sellerPayment.totalAmountBilled = sellerPayment.billings.reduce(
          (sum, billing) => sum + billing.amount,
          0
        );
        sellerPayment.paymentRemaining =
          sellerPayment.totalAmountBilled - sellerPayment.totalAmountPaid;
        await sellerPayment.save();
      }

      // Handle transportation payments if transportation details exist
      if (purchase.transportationDetails) {
        const { logistic, local } = purchase.transportationDetails;

        // Remove logistic transportation billing if exists
        if (logistic) {
          const transportPayment = await TransportPayment.findOne({
            transportName: logistic.transportCompanyName,
            transportType: 'logistic',
          });

          if (transportPayment) {
            transportPayment.billings = transportPayment.billings.filter(
              (billing) => billing.billId !== logistic.billId
            );
            transportPayment.totalAmountBilled = transportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            transportPayment.paymentRemaining =
              transportPayment.totalAmountBilled - transportPayment.totalAmountPaid;
            await transportPayment.save();
          }

          // Remove Transportation document
          await Transportation.deleteOne({
            purchaseId,
            transportType: 'logistic',
          });
        }

        // Remove local transportation billing if exists
        if (local) {
          // Similar logic for local transportation\

          const transportPayment = await TransportPayment.findOne({
            transportName: local.transportCompanyName,
            transportType: 'local',
          });

          if (transportPayment) {
            transportPayment.billings = transportPayment.billings.filter(
              (billing) => billing.billId !== local.billId
            );
            transportPayment.totalAmountBilled = transportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            transportPayment.paymentRemaining =
              transportPayment.totalAmountBilled - transportPayment.totalAmountPaid;
            await transportPayment.save();
          }

          // Remove Transportation document
          await Transportation.deleteOne({
            purchaseId,
            transportType: 'local',
          });
        }
      }

      // Delete the purchase
      await Purchase.deleteOne({ _id: req.params.id });

      res.json({ message: 'Purchase deleted successfully' });
    } catch (error) {
      console.error('Error deleting purchase:', error);
      res.status(500).json({ message: 'Error deleting purchase', error: error.message });
    }
  })
);






productRouter.get('/purchases/all',async (req,res) => {
  const allpurchases = await Purchase.find().sort({ createdAt: -1});
  if(allpurchases){
    res.status(200).json(allpurchases)
  }else{
    console.log("no bills")
    res.status(500).json({message: "No Purchase Bills Available"})
  }
});


// Route to fetch all low-stock products
productRouter.get('/all-items/low-stock', async (req, res) => {
  try {
    const products = await Product.find({ countInStock: { $lt: 10 } }).sort({ countInStock: 1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});

// Route to fetch a limited number of low-stock products (e.g., for homepage)
productRouter.get('/items/low-stock-limited', async (req, res) => {
  try {
    const products = await Product.find({ countInStock: { $lt: 10 } })
      .sort({ countInStock: 1 })
      // .limit(3); // Limit to 3 products

    const outOfStockProducts = products.filter(product => product.countInStock == 0);
    const lowStockProducts = products.filter(product => product.countInStock > 0);

    // Combine them for the limited response
    const sortedLimitedProducts = [...outOfStockProducts, ...lowStockProducts].slice(0, 1); // Limit to 3
    res.json(sortedLimitedProducts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});


productRouter.get('/low-stock/all', async (req, res) => {
  try {
    const products = await Product.find({ countInStock: { $lt: 10 } })
      .sort({ countInStock: 1 })
      // .limit(3); // Limit to 3 products

    const outOfStockProducts = products.filter(product => product.countInStock == 0);
    const lowStockProducts = products.filter(product => product.countInStock > -100);

    // Combine them for the limited response
    const sortedLimitedProducts = [...outOfStockProducts, ...lowStockProducts] // Limit to 3
    res.json(sortedLimitedProducts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});


productRouter.get('/lastadded/id', async (req, res) => {
  try {
    // Fetch the invoice with the highest sequence number starting with 'K'
    const item = await Product.findOne({ item_id: /^K\d+$/ })
      .sort({ item_id: -1 })
      .collation({ locale: "en", numericOrdering: true });

    // Check if an invoice was found
    if (item) {
      res.json(item.item_id);
    } else {
      const newitem = await Product.find()
      .sort({ item_id: -1 })
      .collation({ locale: "en", numericOrdering: true });
      res.json(newitem.item_id);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching last order' });
  }
});




productRouter.get(
  '/stock/stock-logs',
  asyncHandler(async (req, res) => {
    try {
      // Fetch all related data in parallel
      const [billings, purchases, returns, damages, openings, products] = await Promise.all([
        Billing.find({ isApproved: true }).lean(),
        Purchase.find().lean(),
        Return.find().lean(),
        Damage.find().lean(),
        StockOpening.find().lean(),
        Product.find().lean(),
      ]);

      // Create a quick-lookup map for product details
      const productMap = {};
      for (const p of products) {
        productMap[p.item_id] = p;
      }

      // Each log entry structure:
      // {
      //   date: Date,
      //   itemId: String,
      //   name: String,
      //   brand: String,
      //   category: String,
      //   changeType: "Sales (Billing)" | "Purchase" | "Return" | "Damage" | "Opening Stock",
      //   invoiceNo: String or null,
      //   quantityChange: Number,
      //   finalStock: Number (current countInStock)
      // }

      // Billing (Sales) Logs: products sold reduce stock
      const billingLogs = billings.flatMap((b) =>
        b.products.map((prod) => {
          const pInfo = productMap[prod.item_id] || {};
          return {
            date: b.createdAt,
            itemId: prod.item_id,
            name: pInfo.name || prod.name,
            brand: pInfo.brand || prod.brand,
            category: pInfo.category || prod.category,
            changeType: 'Sales (Billing)',
            invoiceNo: b.invoiceNo,
            quantityChange: -Math.abs(prod.quantity),
            finalStock: pInfo.countInStock || 0,
          };
        })
      );

      // Purchase Logs: purchased items increase stock
      const purchaseLogs = purchases.flatMap((pur) =>
        pur.items.map((item) => {
          const pInfo = productMap[item.itemId] || {};
          return {
            date: pur.createdAt,
            itemId: item.itemId,
            name: pInfo.name || item.name,
            brand: pInfo.brand || item.brand,
            category: pInfo.category || item.category,
            changeType: 'Purchase',
            invoiceNo: pur.invoiceNo,
            quantityChange: Math.abs(item.quantityInNumbers),
            finalStock: pInfo.countInStock || 0,
          };
        })
      );

      // Return Logs: returned items add back to stock
      const returnLogs = returns.flatMap((r) =>
        r.products.map((prod) => {
          const pInfo = productMap[prod.item_id] || {};
          return {
            date: r.createdAt,
            itemId: prod.item_id,
            name: pInfo.name || prod.name,
            brand: pInfo.brand || '',
            category: pInfo.category || '',
            changeType: 'Return',
            invoiceNo: r.returnNo,
            quantityChange: Math.abs(prod.quantity),
            finalStock: pInfo.countInStock || 0,
          };
        })
      );

      // Damage Logs: damaged items reduce stock
      const damageLogs = damages.flatMap((d) =>
        d.damagedItems.map((item) => {
          const pInfo = productMap[item.item_id] || {};
          return {
            date: d.createdAt,
            itemId: item.item_id,
            name: pInfo.name || item.name,
            brand: pInfo.brand || '',
            category: pInfo.category || '',
            changeType: 'Damage',
            invoiceNo: null,
            quantityChange: -Math.abs(item.quantity),
            finalStock: pInfo.countInStock || 0,
          };
        })
      );

      // Opening Stock Logs: initial or manually added opening stocks
      const openingLogs = openings.map((o) => {
        const pInfo = productMap[o.item_id] || {};
        return {
          date: o.createdAt,
          itemId: o.item_id,
          name: pInfo.name || o.name,
          brand: pInfo.brand || '',
          category: pInfo.category || '',
          changeType: 'Opening Stock',
          invoiceNo: null,
          quantityChange: Math.abs(o.quantity),
          finalStock: pInfo.countInStock || 0,
        };
      });

      let logs = [
        ...billingLogs,
        ...purchaseLogs,
        ...returnLogs,
        ...damageLogs,
        ...openingLogs,
      ];

      // Sort logs by date ascending by default
      logs = logs.sort((a, b) => new Date(a.date) - new Date(b.date));

      res.json(logs);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to fetch stock logs.' });
    }
  })
);




export default productRouter;
