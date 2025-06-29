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
import StockRegistry from '../models/StockregistryModel.js';
import NeedToPurchase from '../models/needToPurchase.js';
import mongoose from 'mongoose';


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
  '/allbrands',
  expressAsyncHandler(async (req, res) => {
    const categories = await Product.find().distinct('brand');
    res.send(categories);
  })
);

productRouter.get(
  '/alltypes',
  expressAsyncHandler(async (req, res) => {
    const types = await Product.aggregate([
      { $group:  { _id: '$type', lengths: { $addToSet: '$length' }, breadths: { $addToSet: '$breadth' }, actLengths: { $addToSet: '$actLength' } , actBreadths: { $addToSet: '$actBreadth' } , sizes: { $addToSet: '$size' }, psRatios: { $addToSet: '$psRatio' } } },
      { $match: { lengths: { $nin: [null, '', undefined] }, breadths: { $nin: [null, '', undefined] } } }
    ])
    res.send(types);
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
  const limit = parseFloat(req.query.limit) || 16;

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
    // Clear the collection to start fresh
    await Product.deleteMany({});

    // Filter out products that do not have a valid 'name'
    const validProducts = data.products.filter((product) => {
      return product.name && product.name.trim() !== '';
    });

    // Optionally log the products that are being skipped due to missing 'name'
    const skippedProducts = data.products.filter(
      (product) => !product.name || product.name.trim() === ''
    );
    if (skippedProducts.length > 0) {
      console.log(
        `Skipped ${skippedProducts.length} product(s) due to missing 'name':`,
        skippedProducts
      );
    }

    // Log valid products for debugging
    // console.log('Products to insert:', validProducts);

    // Insert only the valid products into the database
    const createdProducts = await Product.insertMany(validProducts);

    // Return a 201 status with the inserted products
    res.status(201).json({ createdProducts });
  })
);


productRouter.get(
  '/:id',
  expressAsyncHandler(async (req, res) => {
    const id = req.params.id.toUpperCase();

    try {
      let product;
      
      // Check if the id starts with 'K' followed by numbers
      if (/^K\d+$/.test(id) || /^k\d+$/.test(id)) {
        // Search by item_id
        product = await Product.findOne({ item_id: id });
      } else {
        // Search by _id
        product = await Product.findById(id);
      }

      if (product) {
        res.send(product);
      } else {
        res.status(404).send({ message: 'Product Not Found' });
      }
    } catch (error) {
      // Handle errors (e.g., invalid ObjectId format)
      res.status(400).send({ message: 'Invalid ID format or other error', error: error.message });
    }
  })
);


productRouter.post(
  '/',
  expressAsyncHandler(async (req, res) => {
    /* -----------------------------------------------------------
       1.  Pull out request fields
    ----------------------------------------------------------- */
    const {
      name,
      item_id,
      brand,
      category,
      price,
      countInStock,
      pUnit,
      sUnit,
      hsnCode,
      seller = '',
      sellerAddress = '',
      image = '',
      description = '',
      psRatio = '',
      length = '',
      breadth = '',
      actLength = '',
      actBreadth = '',
      size = '',
      unit = '',
      billPartPrice = 0,
      cashPartPrice = 0,
      type = '',
      rating = 0,
      numReviews = 0,
      gstPercent = 0
    } = req.body;

    /* -----------------------------------------------------------
       2.  Manual field validation with if / else
    ----------------------------------------------------------- */
    const requiredStr = (field, value) => {
      if (!value || typeof value !== 'string' || !value.trim()) {
        res.status(422).json({ message: `${field} is required` });
        return false;
      }
      return true;
    };

    // Required string fields
    if (
      !requiredStr('name', name) ||
      !requiredStr('item_id', item_id) ||
      !requiredStr('brand', brand) ||
      !requiredStr('category', category) ||
      !requiredStr('hsnCode', hsnCode)
    ) {
      return;
    }

    // Required numeric fields
    if (price === undefined || isNaN(price) || Number(price) < 0) {
      return res
        .status(422)
        .json({ message: 'Price is required and must be ≥ 0' });
    }
    if (
      countInStock === undefined ||
      isNaN(countInStock) ||
      Number(countInStock) < 0
    ) {
      return res
        .status(422)
        .json({ message: 'countInStock is required and must be ≥ 0' });
    }

    // Required enum fields
    const units = ['NOS', 'SQFT', 'GSQFT', 'BOX'];
    if (!units.includes(pUnit)) {
      return res
        .status(422)
        .json({ message: 'pUnit must be NOS, SQFT, GSQFT or BOX' });
    }
    if (!units.includes(sUnit)) {
      return res
        .status(422)
        .json({ message: 'sUnit must be NOS, SQFT, GSQFT or BOX' });
    }

    /* -----------------------------------------------------------
       3.  Duplicate checks
    ----------------------------------------------------------- */
    const nameExists = await Product.findOne({ name });
    if (nameExists) {
      return res.status(409).json({ message: 'Product name already exists' });
    }

    const idExists = await Product.findOne({ item_id });
    if (idExists) {
      return res.status(409).json({ message: 'Item ID already exists' });
    }

    /* -----------------------------------------------------------
       4.  Persist
    ----------------------------------------------------------- */
    try {
      const product = new Product({
        name: name.trim(),
        item_id: item_id.trim(),
        brand: brand.trim(),
        category: category.trim(),
        price: Number(price),
        countInStock: Number(countInStock),
        pUnit,
        sUnit,
        hsnCode: hsnCode.trim(),
        seller: seller.trim(),
        sellerAddress: sellerAddress.trim(),
        image,
        description: description.trim(),
        psRatio,
        length,
        breadth,
        actLength,
        actBreadth,
        size,
        unit,
        billPartPrice: Number(billPartPrice) || 0,
        cashPartPrice: Number(cashPartPrice) || 0,
        type,
        rating: Number(rating) || 0,
        numReviews: Number(numReviews) || 0,
        gstPercent: Number(gstPercent) || 0,
        reviews: []
      });

      const created = await product.save();
      return res.status(201).json(created);
    } catch (err) {
      console.error('Error creating product:', err);
      return res
        .status(500)
        .json({ message: 'Server error while creating product' });
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
  const {
    newQty,
    userName            = 'unknown',
    needToPurchase      = false,
    invoiceNo           = '',
  } = req.body;

  /* 1️⃣  validate input --------------------------------------------------- */
  const qty = Number(newQty);
  if (Number.isNaN(qty) || qty <= 0) {
    return res.status(400).json({ message: 'Invalid newQty value' });
  }

  try {
    /* 2️⃣  fetch product -------------------------------------------------- */
    const product = await Product.findById(req.params.id).lean(); // lean → plain JS obj
    if (!product) return res.status(404).json({ message: 'Product not found' });

    /* 3️⃣  optionally fetch billing doc (once) --------------------------- */
    let billDoc = null;
    if (invoiceNo.trim()) {
      billDoc = await Billing.findOne({ invoiceNo }).select('_id invoiceNo');
    }

    /* 4️⃣  NEED-TO-PURCHASE branch --------------------------------------- */
    if (needToPurchase) {
      await NeedToPurchase.create({
        item_id:  product.item_id,
        name:     product.name,
        quantity: qty,
        quantityNeeded: qty,
        requestedBy: userName,
        invoiceNo: billDoc ? billDoc.invoiceNo : '--',
      });

      if (billDoc) {
        await Billing.updateOne(
          { _id: billDoc._id },
          {
            $push: {
              neededToPurchase: {
                item_id: product.item_id,
                name:    product.name,
                quantityOrdered: qty,
                quantityNeeded:  qty,
              },
            },
          }
        );

        await billDoc.save();
      }

      return res.json({
        message: 'Recorded as need-to-purchase; stock unchanged.',
        product,
      });
    }

    /* 5️⃣  NORMAL STOCK UPDATE branch ------------------------------------ */
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $inc: { countInStock: qty } },
      { new: true, lean: true }
    );

    if (billDoc) {
      await Billing.updateOne(
        { _id: billDoc._id },
        {
          $push: {
            neededToPurchase: {
              item_id: product.item_id,
              name:    product.name,
              quantityOrdered: qty,
              quantityNeeded:  qty,
            },
          },
        }
      );
    }

    // log stock-opening
    await StockOpening.create({
      item_id:    product.item_id,
      name:       product.name,
      quantity:   qty,
      submittedBy:userName,
      remark:     'Bill Opening',
      date:       new Date(),
    });

    // registry entry
    await StockRegistry.create({
      date:           new Date(),
      updatedBy:      userName,
      itemId:         product.item_id,
      name:           product.name,
      brand:          product.brand,
      category:       product.category,
      changeType:     'Sales Billing (Update Stock)',
      invoiceNo:      billDoc ? billDoc.invoiceNo : '',
      quantityChange: qty,
      finalStock:     updatedProduct.countInStock,
    });

    return res.json(updatedProduct);
  } catch (err) {
    console.error('update-stock error:', err);
    res.status(500).json({ message: 'Error updating product stock', error: err.message });
  }
});


productRouter.put(
  '/:id',
  expressAsyncHandler(async (req, res) => {
    const productId = req.params.id;
    const updatedProduct = req.body; // Directly use req.body
    const product = await Product.findById(productId);
    
    if (product) {
      product.item_id = updatedProduct.item_id || updatedProduct.itemId || product.item_id;
      product.name = updatedProduct.name || product.name;
      product.price = updatedProduct.price || product.price;
      product.image = updatedProduct.image || product.image;
      product.category = updatedProduct.category || product.category;
      product.brand = updatedProduct.brand || product.brand;
      product.countInStock = updatedProduct.countInStock || product.countInStock;
      product.description = updatedProduct.description || product.description;
      product.psRatio = updatedProduct.psRatio || product.psRatio;
      product.pUnit = updatedProduct.pUnit || product.pUnit;
      product.sUnit = updatedProduct.sUnit || product.sUnit;
      product.length = updatedProduct.length || product.length;
      product.breadth = updatedProduct.breadth || product.breadth;
      product.size = updatedProduct.size || product.size;
      product.unit = updatedProduct.unit || product.unit;
      product.type = updatedProduct.type || product.type;
      product.cashPartPrice = updatedProduct.cashPartPrice || product.cashPartPrice;
      product.billPartPrice = updatedProduct.billPartPrice || product.billPartPrice;
      product.actLength = updatedProduct.actLength || product.actLength;
      product.actBreadth = updatedProduct.actBreadth || product.actBreadth;
      product.hsnCode = updatedProduct.hsnCode || product.hsnCode;
      product.gstPercent = updatedProduct.gstPercent || product.gstPercent;
      product.seller = updatedProduct.seller || product.seller;
      product.sellerAddress = updatedProduct.sellerAddress || product.sellerAddress;
      
      const updated = await product.save();
      res.send({ message: 'Product Updated', product: updated });
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
    const session = await mongoose.startSession();
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
        otherExpenses,
        submittedBy,
        roundOff
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

      await session.withTransaction(async () => {
      
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
          product.hsnCode = item.hsnCode;
          product.gstPercent = item.gstPercent,
          product.type = item.itemType
          Object.assign(product, item);
          await product.save({ session });

              // --- 📌 Add StockRegistry Entry Here ---
    const stockEntry = new StockRegistry({
      date: new Date(),
      updatedBy: 'user', // Assuming userId comes from authenticated request
      itemId: product.item_id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      changeType: 'Purchase',
      invoiceNo: invoiceNo.trim(),
      quantityChange: Math.abs(quantityInNumbers), // Stock increase
      finalStock: product.countInStock,
    });

    await stockEntry.save({ session });
        } else {
          const newProduct = new Product({
            item_id: item.itemId,
            ...item,
            type: item.itemType,
            countInStock: quantityInNumbers,
            price: parseFloat(item.totalPriceInNumbers),
            gstPercent: item.gstPercent,
          });
          await newProduct.save({ session });


          // --- 📌 Add StockRegistry Entry for New Product ---
    const stockEntry = new StockRegistry({
      date: new Date(),
      updatedBy: 'user',
      itemId: newProduct.item_id,
      name: newProduct.name,
      brand: newProduct.brand,
      category: newProduct.category,
      changeType: 'Purchase (New Product)',
      invoiceNo: invoiceNo.trim(),
      quantityChange: Math.abs(quantityInNumbers),
      finalStock: newProduct.countInStock,
    });

    await stockEntry.save({ session });
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
        otherExpenses,
        submittedBy,
        roundOff
      });

      await purchase.save({session});

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

          await logisticTransport.save({session});

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
          await logisticTransportPayment.save({session});
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

          await localTransport.save({session});

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
          await localTransportPayment.save({session});
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
      await sellerPayment.save({session});

      // 6. Update or create SupplierAccount
      let supplierAccount = await SupplierAccount.findOne({ sellerId });

      const billEntry = {
        invoiceNo,
        billAmount: totals.billPartTotal,
        cashPart: totals.cashPartTotal,
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
      await supplierAccount.save({session});

    })

      res.status(200).json(purchaseId);
    } catch (error) {

      res.status(500).json({ message: 'Error creating purchase', error: error.message });
    }finally{
      await session.endSession()
    }
  })
);


// routes/productRoutes.js (continued)
productRouter.put(
  '/purchase/:purchaseId',
  asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
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
        otherExpenses,
        submittedBy,
        roundOff
      } = req.body;

        await session.withTransaction(async () => {

      const existingPurchase = await Purchase.findOne({ purchaseId });
      if (!existingPurchase) {
        throw new Error('Purchase not found');
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
        const quantityDifference = newQuantity - oldQuantity;


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
          product.hsnCode = item.hsnCode;
          product.price = parseFloat(item.totalPriceInNumbers);
          product.gstPercent = item.gstPercent;
          product.type = item.itemType;
          Object.assign(product, item);
          await product.save({ session });
        } else {
          const newProduct = new Product({
            item_id: item.itemId,
            ...item,
            type: item.itemType,
            countInStock: newQuantity,
            price: parseFloat(item.totalPriceInNumbers),
            gstPercent: item.gstPercent,
          });
          await newProduct.save({ session });
        }


        // Stock Registry Entry
        if (quantityDifference !== 0) {
          const stockEntry = new StockRegistry({
            updatedBy: 'user',
            itemId: item.itemId,
            name: item.name,
            brand: item.brand,
            category: item.category,
            changeType: 'Purchase',
            invoiceNo,
            quantityChange: quantityDifference,
            finalStock: product ? product.countInStock : newQuantity,
          });

          await stockEntry.save({ session });
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
      existingPurchase.otherExpenses = otherExpenses;
      existingPurchase.roundOff = roundOff;
      existingPurchase.submittedBy = submittedBy || existingPurchase.submittedBy;


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
          await oldSupplierAccount.save({ session });
        }

        // Add bill to new supplier
        let newSupplierAccount = await SupplierAccount.findOne({ sellerId });
        const billEntry = {
          invoiceNo,
          billAmount: totals.billPartTotal,
          cashPart: totals.cashPartTotal,
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
        await newSupplierAccount.save({ session });
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
              billAmount: totals.billPartTotal,
              cashPart: totals.cashPartTotal,
              invoiceDate: invoiceDate || Date.now(),
            };
          } else {
            supplierAccount.bills.push({
              invoiceNo,
              billAmount: totals.billPartTotal,
              cashPart: totals.cashPartTotal,
              invoiceDate: invoiceDate || Date.now(),
            });
          }

          supplierAccount.totalBillAmount = supplierAccount.bills.reduce(
            (sum, bill) => sum + bill.billAmount,
            0
          );
          supplierAccount.pendingAmount =
            supplierAccount.totalBillAmount - supplierAccount.paidAmount;
          await supplierAccount.save({ session });
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
          await oldSellerPayment.save({ session });
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
        await newSellerPayment.save({ session });
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
          await sellerPayment.save({ session });
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
          await newSellerPayment.save({ session });
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
          
          // console.log(oldLogistic)
          if (transportPayment) {
            // console.log(transportPayment)
            transportPayment.billings = transportPayment.billings.filter(
              (billing) => billing.billId !== oldLogistic.billId
            );
            transportPayment.totalAmountBilled = transportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            transportPayment.paymentRemaining =
              transportPayment.totalAmountBilled - transportPayment.totalAmountPaid;
            await transportPayment.save({ session });
          }

          // Remove from Transportation
          await Transportation.deleteOne({
            purchaseId,
            transportType: 'logistic',
          },{ session });
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
            await transportPayment.save({ session });
          }

                    // Remove from Transportation
                    await Transportation.deleteOne({
                      purchaseId,
                      transportType: 'local',
                    },{ session });
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

          await logisticTransport.save({ session });

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
          await logisticTransportPayment.save({ session });
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

          await localTransport.save({ session });

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
          await localTransportPayment.save({ session });
        }

        // Similar code for local transportation
      }

      existingPurchase.transportationDetails =
      transportationDetails || existingPurchase.transportationDetails;

    await existingPurchase.save({ session });
        })

      res.status(200).json({ message: 'Purchase updated successfully' });
    } catch (error) {

      res.status(500).json({ message: 'Error updating purchase', error: error.message });
    } finally{
      await session.endSession()
    }
  })
);



productRouter.delete(
  '/purchases/delete/:id',
  asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();

    try {

      await session.withTransaction(async () => {

      const purchase = await Purchase.findById(req.params.id);

      if (!purchase) {
        throw new Error('Purchase not found');
      }

      // Adjust product stock
      for (let item of purchase.items) {
        const product = await Product.findOne({ item_id: item.itemId });

        if (product) {
          product.countInStock -= parseFloat(item.quantityInNumbers);

          if (product.countInStock < 0) {
            product.countInStock = 0; // Ensure stock doesn't go below zero
          }


          // --- 📌 Add StockRegistry Entry ---
          const stockEntry = new StockRegistry({
            date: new Date(),
            updatedBy: 'System', // Deletion is usually system-triggered
            itemId: product.item_id,
            name: product.name,
            brand: product.brand,
            category: product.category,
            changeType: 'Purchase Deletion',
            invoiceNo: purchase.invoiceNo,
            quantityChange: -parseFloat(item.quantityInNumbers), // Reverse the stock addition
            finalStock: product.countInStock,
          });

          await stockEntry.save({session });

          await product.save({ session });
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
        await supplierAccount.save({ session });
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
        await sellerPayment.save({ session });
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
            await transportPayment.save({ session });
          }

          // Remove Transportation document
          await Transportation.deleteOne({
            purchaseId,
            transportType: 'logistic',
          },{ session });
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
            await transportPayment.save({ session });
          }

          // Remove Transportation document
          await Transportation.deleteOne({
            purchaseId,
            transportType: 'local',
          },{ session });
        }
      }

      
      // Delete the purchase
      await Purchase.deleteOne({ _id: req.params.id },{ session });
    })

      res.json({ message: 'Purchase deleted successfully' });
    } catch (error) {
      console.error('Error deleting purchase:', error);
      res.status(500).json({ message: 'Error deleting purchase', error: error.message });
    }finally{
      await session.endSession();
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


productRouter.get('/items/need-to-purchase', async (req, res) => {
  try {
    // Find Billing documents that have at least one needed-to-purchase item,
    // and sort them by expectedDeliveryDate (ascending)
    const billings = await Billing.find({ "neededToPurchase.0": { $exists: true } })
      .sort({ expectedDeliveryDate: 1 });

    // Flatten the neededToPurchase items from each billing,
    // while preserving contextual fields (e.g., invoiceNo and expectedDeliveryDate)
// Flatten the neededToPurchase items from each billing,
// while preserving contextual fields (e.g., invoiceNo and expectedDeliveryDate)
let neededItems = [];
billings.forEach((billing) => {
  if (billing.neededToPurchase && billing.neededToPurchase.length > 0) {
    billing.neededToPurchase.forEach((item) => {
      // Only include items that are not purchased or not verified
      if (!item.purchased || !item.verified) {
        neededItems.push({
          ...item._doc, // use _doc if using Mongoose documents
          invoiceNo: billing.invoiceNo,
          expectedDeliveryDate: billing.expectedDeliveryDate
        });
      }
    });
  }
});


    // Optionally, if you want to limit the number of items returned (similar to .slice(0, 1) in your original code)
    // you can adjust the slice here:
    const sortedLimitedItems = neededItems.slice(0, 1); // Change limit as needed

    res.json(sortedLimitedItems);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching needed to purchase items', error });
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


productRouter.get('/product/all', async (req, res) => {
  try {
    // Fetch the invoice with the highest sequence number starting with 'K'
    const items = await Product.find();
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching last order' });
  }
});



productRouter.get(
  '/stock/stock-logs',
  asyncHandler(async (req, res) => {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 15;
    const skip  = (page - 1) * limit;

    /* ───── filters ─────────────────────────────────────────────── */
    const filter = {};

    if (req.query.fromDate) {
      filter.date = { ...filter.date, $gte: new Date(req.query.fromDate) };
    }
    if (req.query.toDate) {
      filter.date = { ...filter.date, $lte: new Date(req.query.toDate) };
    }
    if (req.query.itemName) {
      filter.name = { $regex: req.query.itemName, $options: 'i' };
    }
    if (req.query.itemId) {
      filter.itemId = { $regex: req.query.itemId, $options: 'i' };
    }

    if (req.query.brand) {
      filter.brand = { $regex: req.query.brand, $options: 'i' };
    }
    if (req.query.category) {
      filter.category = { $regex: req.query.category, $options: 'i' };
    }
    if (req.query.invoiceNo) {
      filter.invoiceNo = { $regex: req.query.invoiceNo, $options: 'i' };
    }
    if (req.query.changeType) {
      filter.changeType = {$regex: req.query.changeType , $options: 'i'  };
    }

    if(req.query.updatedBy) {
      filter.updatedBy = { $regex: req.query.updatedBy , $options: 'i' }
    }

    /* ───── sorting ─────────────────────────────────────────────── */
    const sortField      = req.query.sortField     || 'date';
    const sortDirection  = req.query.sortDirection === 'desc' ? -1 : 1;
    const sort           = { [sortField]: sortDirection };

    const total = await StockRegistry.countDocuments(filter);

    const logs = await StockRegistry.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ logs, total });
  })
);



// productRouter.get(
//   '/stock/stock-logs',
//   asyncHandler(async (req, res) => {
//     try {
//       // Fetch all related data in parallel
//       const [billings, purchases, returns, damages, openings, products] = await Promise.all([
//         Billing.find({ isApproved: true }).lean(),
//         Purchase.find().lean(),
//         Return.find().lean(),
//         Damage.find().lean(),
//         StockOpening.find().lean(),
//         Product.find().lean(),
//       ]);

//       // Create a quick-lookup map for product details
//       const productMap = {};
//       for (const p of products) {
//         productMap[p.item_id] = p;
//       }

//       // Each log entry structure:
//       // {
//       //   date: Date,
//       //   itemId: String,
//       //   name: String,
//       //   brand: String,
//       //   category: String,
//       //   changeType: "Sales (Billing)" | "Purchase" | "Return" | "Damage" | "Opening Stock",
//       //   invoiceNo: String or null,
//       //   quantityChange: Number,
//       //   finalStock: Number (current countInStock)
//       // }

//       // Billing (Sales) Logs: products sold reduce stock
//       const billingLogs = billings.flatMap((b) =>
//         b.products.map((prod) => {
//           const pInfo = productMap[prod.item_id] || {};
//           return {
//             date: b.createdAt,
//             itemId: prod.item_id,
//             name: pInfo.name || prod.name,
//             brand: pInfo.brand || prod.brand,
//             category: pInfo.category || prod.category,
//             changeType: 'Sales (Billing)',
//             invoiceNo: b.invoiceNo,
//             quantityChange: -Math.abs(prod.quantity),
//             finalStock: pInfo.countInStock || 0,
//           };
//         })
//       );

//       // Purchase Logs: purchased items increase stock
//       const purchaseLogs = purchases.flatMap((pur) =>
//         pur.items.map((item) => {
//           const pInfo = productMap[item.itemId] || {};
//           return {
//             date: pur.createdAt,
//             itemId: item.itemId,
//             name: pInfo.name || item.name,
//             brand: pInfo.brand || item.brand,
//             category: pInfo.category || item.category,
//             changeType: 'Purchase',
//             invoiceNo: pur.invoiceNo,
//             quantityChange: Math.abs(item.quantityInNumbers),
//             finalStock: pInfo.countInStock || 0,
//           };
//         })
//       );

//       // Return Logs: returned items add back to stock
//       const returnLogs = returns.flatMap((r) =>
//         r.products.map((prod) => {
//           const pInfo = productMap[prod.item_id] || {};
//           return {
//             date: r.createdAt,
//             itemId: prod.item_id,
//             name: pInfo.name || prod.name,
//             brand: pInfo.brand || '',
//             category: pInfo.category || '',
//             changeType: 'Return',
//             invoiceNo: r.returnNo,
//             quantityChange: Math.abs(prod.quantity),
//             finalStock: pInfo.countInStock || 0,
//           };
//         })
//       );

//       // Damage Logs: damaged items reduce stock
//       const damageLogs = damages.flatMap((d) =>
//         d.damagedItems.map((item) => {
//           const pInfo = productMap[item.item_id] || {};
//           return {
//             date: d.createdAt,
//             itemId: item.item_id,
//             name: pInfo.name || item.name,
//             brand: pInfo.brand || '',
//             category: pInfo.category || '',
//             changeType: 'Damage',
//             invoiceNo: null,
//             quantityChange: -Math.abs(item.quantity),
//             finalStock: pInfo.countInStock || 0,
//           };
//         })
//       );

//       // Opening Stock Logs: initial or manually added opening stocks
//       const openingLogs = openings.map((o) => {
//         const pInfo = productMap[o.item_id] || {};
//         return {
//           date: o.createdAt,
//           itemId: o.item_id,
//           name: pInfo.name || o.name,
//           brand: pInfo.brand || '',
//           category: pInfo.category || '',
//           changeType: 'Opening Stock',
//           invoiceNo: null,
//           quantityChange: Math.abs(o.quantity),
//           finalStock: pInfo.countInStock || 0,
//         };
//       });

//       let logs = [
//         ...billingLogs,
//         ...purchaseLogs,
//         ...returnLogs,
//         ...damageLogs,
//         ...openingLogs,
//       ];

//       // Sort logs by date ascending by default
//       logs = logs.sort((a, b) => new Date(a.date) - new Date(b.date));

//       res.json(logs);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Failed to fetch stock logs.' });
//     }
//   })
// );




export default productRouter;
