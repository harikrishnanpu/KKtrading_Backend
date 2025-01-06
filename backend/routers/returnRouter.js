import express from "express";
import Return from '../models/returnModal.js'
import Product from "../models/productModel.js";
import Damage from "../models/damageModal.js";
import Log from "../models/Logmodal.js";
const returnRouter = express.Router();
import mongoose from "mongoose";
import Billing from "../models/billingModal.js";
import Purchase from "../models/purchasemodals.js";


returnRouter.get('/',async (req,res)=>{
    try{
        const allReturns = await Return.find().sort({createdAt: -1});
        res.status(200).json(allReturns)
    }catch (error){
        res.status(500).json({message: "Error Fetching"})
    }
})

// Create new return
returnRouter.post('/create', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      returnNo,
      returnType,
      returnDate,
      discount,
      cgst,
      sgst,
      totalTax,
      returnAmount,
      netReturnAmount,
      products,
      billingNo,
      purchaseNo,
      customerName,
      customerAddress,
      sellerName,
      sellerAddress,
    } = req.body;

    // --- 1. Basic Validations ---
    if (!returnType || !['bill', 'purchase'].includes(returnType)) {
      throw new Error('returnType must be either "bill" or "purchase".');
    }

    if (
      !returnNo ||
      !returnDate ||
      !Array.isArray(products) ||
      products.length === 0 ||
      returnAmount === undefined ||
      totalTax === undefined ||
      netReturnAmount === undefined
    ) {
      throw new Error('Missing required fields for creating a return.');
    }

    // --- 2. Additional Validations Based on Return Type ---
    if (returnType === 'bill') {
      if (!billingNo || !customerName || !customerAddress) {
        throw new Error(
          'billingNo, customerName, and customerAddress are required for Bill returns.'
        );
      }
    } else if (returnType === 'purchase') {
      if (!purchaseNo || !sellerName || !sellerAddress) {
        throw new Error(
          'purchaseNo, sellerName, and sellerAddress are required for Purchase returns.'
        );
      }
    }

    // --- 3. Check Uniqueness of returnNo ---
    let finalReturnNo = returnNo;
    const existingReturn = await Return.findOne({ returnNo }).session(session);
    if (existingReturn) {
      // Generate new returnNo with 'CN' prefix
      const latestReturn = await Return.findOne({ returnNo: /^CN\d+$/ })
        .sort({ returnNo: -1 })
        .collation({ locale: 'en', numericOrdering: true })
        .session(session);

      if (!latestReturn) {
        finalReturnNo = 'CN1';
      } else {
        const latestNumberPart = parseInt(latestReturn.returnNo.replace('CN', ''), 10);
        const nextNumber = latestNumberPart + 1;
        finalReturnNo = `CN${nextNumber}`;
      }
    }

    // --- 4. Load Related Document (Billing or Purchase) ---
    let relatedDoc;
    if (returnType === 'bill') {
      relatedDoc = await Billing.findOne({ invoiceNo: billingNo }).session(session);
      if (!relatedDoc) {
        throw new Error(`Billing with invoiceNo ${billingNo} not found.`);
      }
    } else {
      relatedDoc = await Purchase.findOne({ purchaseId: purchaseNo }).session(session);
      if (!relatedDoc) {
        throw new Error(`Purchase with purchaseId ${purchaseNo} not found.`);
      }
    }

    // --- 5. Filter Out Zero-Quantity Products ---
    const filteredProducts = products.filter(
      (prod) => Number(prod.quantity) > 0
    );

    if (filteredProducts.length === 0) {
      throw new Error('All products have zero quantity. Nothing to return.');
    }

    // --- 6. Create the Return Document ---
    const newReturn = new Return({
      returnNo: finalReturnNo,
      returnType,
      returnDate,
      discount: discount || 0,
      cgst: cgst || 0,
      sgst: sgst || 0,
      totalTax: totalTax || 0,
      returnAmount: returnAmount || 0,
      netReturnAmount: netReturnAmount || 0,
      products: filteredProducts,
    });

    // Populate fields based on returnType
    if (returnType === 'bill') {
      newReturn.billingNo = billingNo;
      newReturn.customerName = customerName;
      newReturn.customerAddress = customerAddress;
    } else {
      newReturn.purchaseNo = purchaseNo;
      newReturn.sellerName = sellerName;
      newReturn.sellerAddress = sellerAddress;
    }

    // Save the Return Document
    await newReturn.save({ session });

    // --- 7. Update Product Stocks and Related Document's Returned Quantities ---
    for (const rProd of filteredProducts) {
      const dbProduct = await Product.findOne({ item_id: rProd.item_id }).session(session);
      if (!dbProduct) {
        throw new Error(`Product with ID ${rProd.item_id} not found in Product collection.`);
      }

      // Adjust countInStock based on returnType
      if (returnType === 'purchase') {
        // Decrease stock for Purchase Returns
        if (dbProduct.countInStock < Number(rProd.quantity)) {
          throw new Error(
            `Insufficient stock for product ${rProd.item_id}. Cannot decrease by ${rProd.quantity}. Current stock: ${dbProduct.countInStock}`
          );
        }
        dbProduct.countInStock -= Number(rProd.quantity);
      } else if (returnType === 'bill') {
        // Increase stock for Bill Returns
        dbProduct.countInStock += Number(rProd.quantity);
      }

      // Save the updated Product
      await dbProduct.save({ session });

      // Update returnedQuantity in Billing or Purchase Document
      if (returnType === 'bill') {
        const billProd = relatedDoc.products.find(
          (bp) => bp.item_id === rProd.item_id
        );
        if (!billProd) {
          throw new Error(`Product ${rProd.item_id} not found in billing doc for update.`);
        }
        billProd.returnedQuantity = (billProd.returnedQuantity || 0) + Number(rProd.quantity);
      } else {
        const purchaseItem = relatedDoc.items.find(
          (pi) => pi.itemId === rProd.item_id
        );
        if (!purchaseItem) {
          throw new Error(`Item ${rProd.item_id} not found in purchase doc for update.`);
        }
        purchaseItem.returnedQuantity = (purchaseItem.returnedQuantity || 0) + Number(rProd.quantity);
      }
    }

    // Save the updated Billing or Purchase Document
    await relatedDoc.save({ session });

    // --- 8. Commit the Transaction ---
    await session.commitTransaction();
    session.endSession();

    // --- 9. Respond to Client ---
    res.status(201).json({ success: true, returnNo: finalReturnNo });
  } catch (error) {
    // --- 10. Rollback Transaction in Case of Error ---
    await session.abortTransaction();
    session.endSession();
    console.error('Error creating return:', error);
    return res.status(400).json({ success: false, message: error.message });
  }
});


  // POST /api/damage/create
returnRouter.post('/damage/create', async (req, res) => {
    const { userName, damagedItems, remark } = req.body;

    if (!userName || damagedItems.length === 0) {
      return res.status(400).json({ message: 'User name and damaged items are required.' });
    }
  
    try {
      // Save the damage bill
      const damage = new Damage({
        userName,
        remark,
        damagedItems
      });
      await damage.save();

      console.log("saved")
  
      // Reduce the countInStock for each damaged item
      for (const damagedItem of damagedItems) {
        await Product.findOneAndUpdate(
          { item_id: damagedItem.item_id },
          { $inc: { countInStock: -parseFloat(damagedItem.quantity) } },
          { new: true }
        );
      }
  
      res.status(201).json({ message: 'Damage bill created successfully and stock updated.' });

    } catch (error) {
      res.status(500).json({ message: 'Error creating damage bill or updating stock.', error });
    }
  });


  // GET /api/damage/getDamagedData
returnRouter.get('/damage/getDamagedData', async (req, res) => {
    try {
      const damagedData = await Damage.find().sort({createdAt: -1}); // Fetches all damaged items from the DB
      res.json(damagedData);
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving damaged data.', error });
    }
  });


  returnRouter.delete('/damage/delete/:damageId/:itemId', async (req, res) => {
    try {
      const { damageId, itemId } = req.params;
  
      // Find the specific damage record by ID
      const damage = await Damage.findById(damageId);
  
      if (!damage) {
        return res.status(404).json({ message: 'Damage record not found' });
      }
  
      // Find the specific item within the damaged items array
      const itemIndex = damage.damagedItems.findIndex(item => item.item_id === itemId);
  
      if (itemIndex === -1) {
        return res.status(404).json({ message: 'Item not found in the damage bill' });
      }
  
      const item = damage.damagedItems[itemIndex];
  
      // Update the product stock for the item
      const product = await Product.findOne({ item_id: item.item_id });
  
      if (product) {
        product.countInStock += parseFloat(item.quantity);
        await product.save();
      }
  
      // Remove the specific item from the damaged items array
      damage.damagedItems.splice(itemIndex, 1);
  
      // If there are no items left in the damage bill, remove the entire document
      if (damage.damagedItems.length === 0) {
        await damage.remove();
        return res.send({ message: 'All items removed. Damage bill deleted.' });
      }
  
      // Otherwise, save the updated damage document
      await damage.save();
      res.send({ message: 'Item removed from the damage bill', updatedDamage: damage });
  
    } catch (error) {
      res.status(500).send({ message: 'Error occurred', error });
    }
  });
  


  returnRouter.delete('/return/delete/:id', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      const returnId = req.params.id;
  
      // 1. Find the Return Entry by ID
      const returnEntry = await Return.findById(returnId).session(session);
  
      if (!returnEntry) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: 'Return entry not found.' });
      }
  
      const { returnType, products, billingNo, purchaseNo } = returnEntry;
  
      // 2. Load the Related Document (Billing or Purchase)
      let relatedDoc;
      if (returnType === 'bill') {
        relatedDoc = await Billing.findOne({ invoiceNo: billingNo }).session(session);
        if (!relatedDoc) {
          throw new Error(`Related Billing with invoiceNo ${billingNo} not found.`);
        }
      } else if (returnType === 'purchase') {
        relatedDoc = await Purchase.findOne({ purchaseId: purchaseNo }).session(session);
        if (!relatedDoc) {
          throw new Error(`Related Purchase with purchaseId ${purchaseNo} not found.`);
        }
      } else {
        throw new Error('Invalid returnType. Must be either "bill" or "purchase".');
      }
  
      // 3. Iterate Through Each Product in the Return Entry
      for (const item of products) {
        const { item_id, quantity } = item;
  
        // 3.1. Find the Product in the Product Collection
        const product = await Product.findOne({ item_id }).session(session);
        if (!product) {
          throw new Error(`Product with ID ${item_id} not found in Product collection.`);
        }
  
        // 3.2. Adjust countInStock Based on returnType
        if (returnType === 'purchase') {
          // Original Return Against Purchase decreased stock, so deleting it should increase stock
          product.countInStock += Number(quantity);
        } else if (returnType === 'bill') {
          // Original Return Against Bill increased stock, so deleting it should decrease stock
          product.countInStock -= Number(quantity);
          if (product.countInStock < 0) {
            product.countInStock = 0; // Prevent negative stock
          }
        }
  
        // Save the updated Product
        await product.save({ session });
  
        // 3.3. Update returnedQuantity in Related Document
        if (returnType === 'bill') {
          const billProduct = relatedDoc.products.find((bp) => bp.item_id === item_id);
          if (billProduct) {
            billProduct.returnedQuantity = (billProduct.returnedQuantity || 0) - Number(quantity);
            if (billProduct.returnedQuantity < 0) {
              billProduct.returnedQuantity = 0; // Prevent negative returnedQuantity
            }
          } else {
            throw new Error(`Product ${item_id} not found in Billing document for update.`);
          }
        } else if (returnType === 'purchase') {
          const purchaseItem = relatedDoc.items.find((pi) => pi.itemId === item_id);
          if (purchaseItem) {
            purchaseItem.returnedQuantity = (purchaseItem.returnedQuantity || 0) - Number(quantity);
            if (purchaseItem.returnedQuantity < 0) {
              purchaseItem.returnedQuantity = 0; // Prevent negative returnedQuantity
            }
          } else {
            throw new Error(`Item ${item_id} not found in Purchase document for update.`);
          }
        }
      }
  
      // 4. Save the Updated Related Document
      await relatedDoc.save({ session });
  
      // 5. Delete the Return Entry
      await returnEntry.remove({ session });
  
      // 6. Commit the Transaction
      await session.commitTransaction();
      session.endSession();
  
      // 7. Respond to Client
      res.status(200).json({ success: true, message: 'Return entry deleted successfully.' });
    } catch (error) {
      // 8. Abort the Transaction in Case of Error
      await session.abortTransaction();
      session.endSession();
  
      console.error('Error deleting return entry:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
  



  returnRouter.get('/lastreturn/id', async (req, res) => {
    try {
      const returnbill = await Return.findOne().sort({ createdAt: -1 });
      if(returnbill){
      res.json(returnbill.returnNo);
      }else {
        res.json("CN00")
      }
    } catch (error) {
      res.status(500).json({ message: 'Error fetching last order' });
    }
  });


  // Get return suggestions
  returnRouter.get('/api/returns/suggestions', async (req, res) => {
    try {
      const search = req.query.search;
      const returns = await Return.find({ returnNo: { $regex: search, $options: 'i' } }).limit(10);
      res.json(returns);
    } catch (error) {
      res.status(500).send('Error fetching return suggestions');
    }
  });
  
  // Get return details by Return No
  returnRouter.get('/api/returns/details/:returnNo', async (req, res) => {
    try {
      const returnNo = req.params.returnNo;
      const returnData = await Return.findOne({ returnNo: returnNo });
      res.json(returnData);
    } catch (error) {
      res.status(500).send('Error fetching return details');
    }
  });
  
  // Update return details by Return No
  returnRouter.put('/api/returns/update/:returnNo', async (req, res) => {
    const session = await Return.startSession();
    session.startTransaction();
  
    try {
      const returnNo = req.params.returnNo;
      const {
        billingNo,
        returnDate,
        customerName,
        customerAddress,
        products,
        returnAmount,
        totalTax,
        netReturnAmount,
      } = req.body;
  
      // Filter out products with quantity 0
      const filteredProducts = products.filter((product) => product.quantity > 0);
  
      // Update return details
      const updatedReturn = await Return.findOneAndUpdate(
        { returnNo: returnNo },
        {
          returnDate,
          billingNo,
          returnAmount,
          totalTax,
          netReturnAmount,
          customerName,
          customerAddress,
          products: filteredProducts,
        },
        { new: true, session }
      );
  
      if (!updatedReturn) {
        throw new Error(`Return with No ${returnNo} not found`);
      }
  
      // Update countInStock for each product
      for (const product of filteredProducts) {
        const updatedProduct = await Product.findOne({ item_id: product.item_id }).session(session);
  
        if (!updatedProduct) {
          throw new Error(`Product with ID ${product.item_id} not found`);
        }
  
        // Adjust countInStock (increase if product is returned)
        updatedProduct.countInStock += parseFloat(product.quantity);
  
        await updatedProduct.save({ session });
      }
  
      // Commit the transaction
      await session.commitTransaction();
      session.endSession();
  
      res.json(updatedReturn);
    } catch (error) {
      // Abort the transaction in case of an error
      await session.abortTransaction();
      session.endSession();
  
      res.status(500).json({ message: 'Error updating return or updating stock', error });
    }
  });
  

export default returnRouter;
