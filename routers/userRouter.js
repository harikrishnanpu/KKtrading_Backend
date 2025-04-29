import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import bcrypt from 'bcryptjs';
import data from '../data.js';
import User from '../models/userModel.js';
// import { generateToken, isAdmin, isAuth } from '../utils.js';
import AttendenceModel from '../models/attendenceModel.js';
import Location from '../models/locationModel.js'
import Billing from '../models/billingModal.js';
import Product from '../models/productModel.js';
import Log from '../models/Logmodal.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';
import CustomerAccount from '../models/customerModal.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';


const userRouter = express.Router();


userRouter.get(
  '/top-sellers',
  expressAsyncHandler(async (req, res) => {
    const topSellers = await User.find({ isSeller: true })
      .sort({ 'seller.rating': -1 })
      .limit(3);
    res.send(topSellers);
  })
);

userRouter.get(
  '/seed',
  expressAsyncHandler(async (req, res) => {
    const createdUsers = await User.insertMany(data.users);
    res.send({ createdUsers });
  })
);

userRouter.post(
  '/signin',
  expressAsyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Check if both email and password are provided
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid User Name || User Not Found' });
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Wrong Password!' });
    }

    // Generate JWT token if login is successful
    const serviceToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'SECRET_KEY',
      { expiresIn: '1 days' }
    );

    return res.status(200).json({
      serviceToken,
      user: {
        _id: user._id,
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isAdmin: user.isAdmin,
        isEmployee: user.isEmployee,
        isSuper: user.isSuper
      }
    });
  })
);



userRouter.post(
  '/register',
  expressAsyncHandler(async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Validate input fields
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      if (!firstName || !lastName) {
        return res.status(400).json({ message: "First and last name are required" });
      }

      // Check if user already exists
      const isAlreadyRegistered = await User.findOne({ email }); // Use await here
      if (isAlreadyRegistered) {
        console.log('User already exists');
        return res.status(400).json({ message: "User already exists" });
      }

      // Create new user
      const hashedPassword = bcrypt.hashSync(password, 10);
      const createdUser = new User({
        email,
        password: hashedPassword,
        name: `${firstName} ${lastName}`, // Proper name formatting
        role: 'sales',
        isAdmin: false,
        isEmployee: false,
        isSuper: false,
        status: 'offline'
      });

      if(createdUser){

        const serviceToken =  jwt.sign(
          {
            userId: createdUser._id,
          },
          process.env.JWT_SECRET || 'SECRET_KEY',
          {
            expiresIn: '1 days',
          }
        );

        // Save the user to the database
        await createdUser.save();
        
        // Prepare the response object
        const user = {
          _id: createdUser._id,
          id: createdUser._id,
          email: createdUser.email,
          name: createdUser.name,
          role: createdUser.role,
          isAdmin: createdUser.isAdmin,
          isEmployee: createdUser.isEmployee,
          isSuper: createdUser.isSuper
        };
        
      return res.status(200).json({ serviceToken, user }); // Use 201 for successful creation
      }
    } catch (error) {
      console.error("Error during user registration:", error); // Log the error
      return res.status(500).json({ message: "Internal server error" });
    }
  })
);




userRouter.get(
  '/auth/check-token',
  expressAsyncHandler(async (req, res) => {
    try {
      const authorization = req.headers.authorization;

      // Check if the token is missing
      if (!authorization) {
        console.log('Token Missing');
        return res.status(401).json({ message: 'Token Missing' });
      }

      // Extract the token
      const accessToken = authorization.split(' ')[1];

      // Verify the token
      let data;
      try {
        data = jwt.verify(accessToken, 'SECRET_KEY'); // Replace with your secret key
      } catch (error) {
        console.error('Invalid Token:', error.message);
        return res.status(401).json({ message: 'Invalid Token' });
      }

      // Get userId from the token data
      const userId = typeof data === 'object' ? data?.userId : '';

      // Fetch the user from the database
      const user = await User.findById(userId); // Ensure this is awaited

      if (!user) {
        console.log('User not found for given token');
        return res.status(401).json({ message: 'Invalid Token' });
      }

      // Respond with user data
      return res.status(200).json({
        user: {
          _id: user._id,
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isAdmin: user.isAdmin,
          isEmployee: user.isEmployee,
          isSuper: user.isSuper
        },
      });
    } catch (err) {
      console.error('Unexpected Error:', err.message);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  })
);




// Get today's attendance for a specific user
userRouter.get('/attendance/today/:userId', async (req, res) => {
  const { userId } = req.params;

  // Get the current date (start and end of day)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0); // Start of day at 00:00:00
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999); // End of day at 23:59:59

  try {
    // Find the attendance for today
    const attendance = await AttendenceModel.findOne({
      userId,
      loginTime: { $gte: startOfDay, $lte: endOfDay },
    });

    if (!attendance) {
      return res.status(404).json({ message: 'No attendance record found for today' });
    }

    res.status(200).json(attendance);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching attendance', error: error.message });
  }
});


userRouter.post('/logout/:userId', async (req, res) => {
  const { userId } = req.params;

  // Find today's attendance record for the user
  const attendance = await AttendenceModel.findOne({
    userId,
    logoutTime: null, // Ensure we are only updating the active session
  });

  if (!attendance) {
    return res.status(200).send('No active session found');
  }

  // // Record logout time
  attendance.logoutTime = new Date();
  await attendance.save();

  res.status(200).send({ message: 'Logout successful' });

});



userRouter.put("/user/edit/:id",  
  expressAsyncHandler(async (req, res) => {
    const userId = req.params.id;
    
    // Find the user by ID
    const user = await User.findById(userId);
    
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }
    
    // Update fields from the request body (if provided)
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    
    // If a new password is provided, update it.
    // NOTE: In production, make sure to hash the password before saving!
    if (req.body.password) {
       user.password = bcrypt.hashSync(req.body.password, 8);
    }
    
    // Update boolean fields explicitly (in case false is passed)
    if (req.body.isAdmin !== undefined) {
      user.isAdmin = req.body.isAdmin;
    }
    if (req.body.isEmployee !== undefined) {
      user.isEmployee = req.body.isEmployee;
    }
    if (req.body.isSuper !== undefined) {
      user.isSuper = req.body.isSuper;
    }
    
    // Update additional fields
    user.role = req.body.role || user.role;
    user.contactNumber = req.body.contactNumber || user.contactNumber;
    user.faceDescriptor = req.body.faceDescriptor || user.faceDescriptor;
    user.work_email = req.body.work_email || user.work_email;
    user.personal_email = req.body.personal_email || user.personal_email;
    user.work_phone = req.body.work_phone || user.work_phone;
    user.personal_phone = req.body.personal_phone || user.personal_phone;
    user.location = req.body.location || user.location;
    user.avatar = req.body.avatar || user.avatar;
    user.status = req.body.status || user.status;
    user.birthdayText = req.body.birthdayText || user.birthdayText;
    user.online_status = req.body.online_status || user.online_status;
    
    // Save the updated user document to the database
    const updatedUser = await user.save();
    
    // Return the updated user as a JSON response
    res.json({
      message: 'User updated successfully',
      user: updatedUser,
    });
  }));
  



userRouter.put(
  '/profile',
  expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.body._id);
    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      if (user.isSeller) {
        user.seller.name = req.body.sellerName || user.seller.name;
        user.seller.logo = req.body.sellerLogo || user.seller.logo;
        user.seller.description =
          req.body.sellerDescription || user.seller.description;
      }
      if (req.body.password) {
        user.password = bcrypt.hashSync(req.body.password, 8);
      }
      const updatedUser = await user.save();
      res.send({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
        isSeller: user.isSeller,
        token: generateToken(updatedUser),
      });
    }
  })
);

userRouter.get(
  '/',
  expressAsyncHandler(async (req, res) => {
    const users = await User.find({});
    res.send(users);
  })
);


userRouter.get('/notify/all', async (req, res) => {
  try {
    const users = await User.find({}, '_id name'); // adjust fields as needed
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});


userRouter.delete(
  '/:id',
  expressAsyncHandler(async (req, res) => {
    // Look up the user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting the super-admin
    if (user.email === 'admin@example.com') {
      return res.status(400).json({ message: 'Cannot delete admin user' });
    }

    // Perform deletion
    await User.findByIdAndDelete(req.params.id);

    res.json({
      message: 'User deleted successfully',
      userId: req.params.id
    });
  })
);



userRouter.get('/:id',
  expressAsyncHandler(async (req,res)=>{
    try{
      const user = await User.findById(req.params.id)
      if(user){
        res.json(user)
      }else{
        res.status(404).send({msg: "User Not Found"})
      }
    }catch(error){
      res.status(500).send({msg: "Error Occured"})
    }
  })
)

userRouter.get('/user/:id',
  expressAsyncHandler(async (req,res)=>{
    try{
      const user = await User.findById(req.params.id)
      if(user){
        res.json(user)
      }else{
        res.status(404).send({msg: "User Not Found"})
      }
    }catch(error){
      res.status(500).send({msg: "Error Occured"})
    }
  })
)

userRouter.put(
  '/:id',
  expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.isSeller = Boolean(req.body.isSeller);
      user.isAdmin = Boolean(req.body.isAdmin);
      // user.isAdmin = req.body.isAdmin || user.isAdmin;
      const updatedUser = await user.save();
      res.send({ message: 'User Updated', user: updatedUser });
    } else {
      res.status(404).send({ message: 'User Not Found' });
    }
  })
);


userRouter.get('/get-face-data/:id', async (req,res) =>{
  const userId = req.params.id
  try{
    const user = await User.findById(userId);
    if (!user) {
       res.status(404).json({ message: 'User not found' });
    }else if(user){
       res.status(200).json(user)
    }
  }catch (error) {
    console.log(error)
     res.status(404).json({ message: 'Error Occured' });
  }


})



userRouter.post('/register-face/:id', async (req, res) => {
  const { faceDescriptor } = req.body;

  try {
    // Find the user in the database
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.faceDescriptor = faceDescriptor
    await user.save();
    res.status(200).json({message: "successfull"})

  } catch (error) {
    console.error('Error during face recognition:', error);
    res.status(500).json({ message: 'Server error' });
  }

});


// Face recognition endpoint (receives face descriptor from frontend)
userRouter.post('/recognize-face/:id', async (req, res) => {
  const userId = req.params.id;
  const { faceDescriptor } = req.body;

  try {
    // Find the user in the database
    const user = await User.findById(userId);

    if (!user || !user.faceDescriptor) {
      return res.status(404).json({ message: 'User not found' });
    }

    function euclideanDistance(descriptor1, descriptor2) {
      let sum = 0;
      for (let i = 0; i < descriptor1.length; i++) {
        sum += (descriptor1[i] - descriptor2[i]) ** 2;
      }
      return Math.sqrt(sum);
    }

    // Compare face descriptors using Euclidean distance
    const distance = euclideanDistance(user.faceDescriptor, faceDescriptor);

    if (distance < 0.6) {  // Threshold value for matching
      console.log("SUCCESSS")
      return res.status(200).json({ message: 'Face matched successfully!' });
    } else {
      console.log("FAIL")
      return res.status(404).send({ message: 'Face did not match' });
    }

    
  } catch (error) {
    console.error('Error during face recognition:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


userRouter.get('/location/users', async (req, res) => {
  try {
      const locations = await Location.find();
      res.status(200).json(locations);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching locations' });
  }
});


// Start Delivery Endpoint
userRouter.post("/billing/start-delivery", async (req, res) => {
  try {
    const { userId, driverName, invoiceNo, startLocation, deliveryId } = req.body;

    // Validate required fields
    if (!userId || !driverName || !invoiceNo || !startLocation || !deliveryId) {
      return res.status(400).json({
        error: "Fields 'userId', 'driverName', 'invoiceNo', 'startLocation', and 'deliveryId' are required."
      });
    }

    // Find the Billing document by invoiceNo
    const billing = await Billing.findOne({ invoiceNo });
    if (!billing) {
      return res.status(404).json({ error: `Billing with invoiceNo '${invoiceNo}' not found.` });
    }

    // Check if the deliveryId already exists in billing.deliveries
    let delivery = billing.deliveries.find(d => d.deliveryId === deliveryId);

    if (!delivery) {
      // Create a new delivery entry
      delivery = {
        deliveryId,
        userId,
        driverName,
        startLocations: [{ coordinates: startLocation, timestamp: new Date() }],
        endLocations: [],
        productsDelivered: [],
        deliveryStatus: "Transit-In",
        kmTravelled: 0,
        startingKm: 0,
        endKm: 0,
        fuelCharge: 0,
        otherExpenses: [],
      };
      billing.deliveries.push(delivery);

      // Ensure deliveryId is tracked in billing.deliveryIds
      if (!billing.deliveryIds.includes(deliveryId)) {
        billing.deliveryIds.push(deliveryId);
      }
    } else {
      // Update existing delivery entry with a new start location
      delivery.startLocations.push({ coordinates: startLocation, timestamp: new Date() });
      delivery.deliveryStatus = "Transit-In";
    }

    await billing.save();

    // Find or create a Location document for this delivery
    let location = await Location.findOne({ deliveryId });

    if (!location) {
      // Create a new Location document
      location = new Location({
        userId,
        driverName,
        invoiceNo,
        deliveryId,
        startLocations: [{ coordinates: startLocation, timestamp: new Date() }],
        endLocations: [],
      });
    } else {
      // Add the new start location to the existing location document
      location.startLocations.push({ coordinates: startLocation, timestamp: new Date() });
    }

    await location.save();

    res.status(200).json({
      message: "Start location and delivery status updated successfully.",
      delivery,
    });

  } catch (error) {
    console.error("Error saving start location and updating delivery status:", error);
    res.status(500).json({ error: "Failed to save start location and update delivery status." });
  }
});


userRouter.post("/billing/cancel-delivery", async (req, res) => {
  try {
    const { userId, driverName, invoiceNo, deliveryId, cancelReason } = req.body;

    // Validate required fields
    if (!userId || !driverName || !invoiceNo || !deliveryId) {
      return res.status(400).json({
        error:
          "Fields 'userId', 'driverName', 'invoiceNo', and 'deliveryId' are required."
      });
    }

    // Find the Billing document by invoiceNo
    const billing = await Billing.findOne({ invoiceNo });
    if (!billing) {
      return res
        .status(404)
        .json({ error: `Billing with invoiceNo '${invoiceNo}' not found.` });
    }

    // Find the index of the delivery record in billing.deliveries
    const deliveryIndex = billing.deliveries.findIndex(
      (d) => d.deliveryId === deliveryId
    );
    if (deliveryIndex === -1) {
      return res.status(404).json({
        error: `Delivery with id '${deliveryId}' not found for invoiceNo '${invoiceNo}'.`
      });
    }

    // Optionally, if you wish to keep an audit trail, you might log the cancellation reason
    // For now, we remove the delivery record completely.
    billing.deliveries.splice(deliveryIndex, 1);

    // Remove the deliveryId from the billing.deliveryIds array
    billing.deliveryIds = billing.deliveryIds.filter((id) => id !== deliveryId);

    await billing.save();

    // Delete the associated Location document if it exists
    await Location.deleteOne({ deliveryId });

    res.status(200).json({
      message: "Delivery cancelled and deleted successfully."
    });
  } catch (error) {
    console.error("Error cancelling delivery:", error);
    res.status(500).json({ error: "Failed to cancel delivery." });
  }
});




// End Delivery Endpoint
userRouter.post("/billing/end-delivery", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const {
      userId,
      invoiceNo,
      endLocation,
      deliveredProducts = [],
      kmTravelled = 0,
      fuelCharge = 0,
      bata = 0,
      vehicleNumber,
      otherExpenses = [],
      startingKm = 0,
      endKm = 0,
      deliveryId,
      method // Payment method for expenses
    } = req.body;

    // 1. Validate required fields
    if (!userId || !invoiceNo || !endLocation || !deliveryId) {
      throw new Error("Fields 'userId', 'invoiceNo', 'endLocation', and 'deliveryId' are required.");
    }

    // Check if any otherExpenses have amount > 0 and require a method
    if (otherExpenses.some(exp => exp.amount > 0) && (!method || !method.trim())) {
      throw new Error("You must provide a 'method' if 'otherExpenses' with amount are provided.");
    }

    // 2. Find the Billing document by invoiceNo
    const billing = await Billing.findOne({ invoiceNo }).session(session);
    if (!billing) {
      throw new Error(`Billing with invoiceNo '${invoiceNo}' not found.`);
    }

    // 3. Find the corresponding delivery entry
    const delivery = billing.deliveries.find((d) => d.deliveryId === deliveryId);
    if (!delivery) {
      throw new Error(`Delivery with deliveryId '${deliveryId}' not found in billing.`);
    }

    // 4. Update delivered products
    for (const dp of deliveredProducts) {
      const { item_id, deliveredQuantity } = dp;

      if (!item_id || deliveredQuantity == null) {
        throw new Error("Each delivered product must have 'item_id' and 'deliveredQuantity'.");
      }

      const product = billing.products.find((p) => p.item_id === item_id);
      if (!product) {
        throw new Error(`Product with item_id '${item_id}' not found in billing products.`);
      }

      const previousDeliveredQuantity = product.deliveredQuantity || 0;
      const totalDeliveredQuantity = previousDeliveredQuantity + deliveredQuantity;

      if (totalDeliveredQuantity > product.quantity) {
        throw new Error(`Delivered quantity for item '${item_id}' exceeds the ordered amount.`);
      }

      // Update product's delivered quantity and status
      product.deliveredQuantity = totalDeliveredQuantity;
      if (totalDeliveredQuantity === product.quantity) {
        product.deliveryStatus = "Delivered";
      } else if (totalDeliveredQuantity > 0) {
        product.deliveryStatus = "Partially Delivered";
      } else {
        product.deliveryStatus = "Pending";
      }

      // Update delivery's productsDelivered
      const deliveredProduct = delivery.productsDelivered.find((p) => p.item_id === item_id);
      if (deliveredProduct) {
        deliveredProduct.deliveredQuantity += deliveredQuantity;
      } else {
        delivery.productsDelivered.push({
          item_id,
          deliveredQuantity,
          psRatio: product.psRatio
        });
      }
    }

    // 5. Update numeric fields for this delivery
    const parsedKmTravelled = parseFloat(kmTravelled);
    const parsedStartingKm = parseFloat(startingKm);
    const parsedEndKm = parseFloat(endKm);
    const parsedFuelCharge = parseFloat(fuelCharge);
    const parsedBata = parseFloat(bata);

    if (!isNaN(parsedKmTravelled)) {
      delivery.kmTravelled = (delivery.kmTravelled || 0) + parsedKmTravelled;
    }

    if (!isNaN(parsedStartingKm)) {
      delivery.startingKm = parsedStartingKm;
    }

    if (!isNaN(parsedEndKm)) {
      delivery.endKm = parsedEndKm;
    }

    if (!isNaN(parsedFuelCharge)) {
      delivery.fuelCharge = (delivery.fuelCharge || 0) + parsedFuelCharge;
    }

    if(!isNaN(parsedBata)){
      delivery.bata = (delivery.bata || 0) + parsedBata;
    }

    if(vehicleNumber !== ''){
      delivery.vehicleNumber = vehicleNumber;
    }



    // 6. Handle Other Expenses for this delivery only
    //    Only update or add expenses; do not remove existing expenses not mentioned
   // 6. Handle Other Expenses for this delivery only
//    Only update or add expenses; if an expense’s amount is 0, remove it from the delivery.
const existingExpensesMap = new Map(delivery.otherExpenses.map(e => [e._id.toString(), e]));

for (const expense of otherExpenses) {
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
    // For new expense with 0 amount, do nothing.
  } else {
    if (id) {
      // Update existing expense in the delivery
      const existingExpense = delivery.otherExpenses.find((e) => e._id.toString() === id.toString());
      if (!existingExpense) {
        throw new Error(`Expense with id '${id}' not found in this delivery.`);
      }
      existingExpense.amount = parsedAmount;
      existingExpense.remark = remark || existingExpense.remark;
      if (method && method.trim()) {
        existingExpense.method = method.trim();
      }
    } else {
      // Add new expense to the delivery with amount greater than 0
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


    // 7. Update billing-level deliveryStatus based on all products
    await billing.updateDeliveryStatus();

    // Now determine this particular delivery's status based on products delivered in this delivery
    const allDeliveredInThisDelivery = delivery.productsDelivered.length > 0 &&
      delivery.productsDelivered.every((dpd) => {
        const prod = billing.products.find((p) => p.item_id === dpd.item_id);
        return prod && prod.deliveredQuantity === prod.quantity;
      });

    const anyDeliveredInThisDelivery = delivery.productsDelivered.some((dpd) => {
      const prod = billing.products.find((p) => p.item_id === dpd.item_id);
      return prod && prod.deliveredQuantity > 0 && prod.deliveredQuantity < prod.quantity;
    });

    if (allDeliveredInThisDelivery) {
      delivery.deliveryStatus = "Delivered";
    } else if (anyDeliveredInThisDelivery) {
      delivery.deliveryStatus = "Partially Delivered";
    } else {
      delivery.deliveryStatus = "Pending";
    }

    // 8. If method is provided, update PaymentsAccount for otherExpenses of this delivery
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
            existingPayment.submittedBy = userId || "system";
            existingPayment.date = new Date();
          } else {
            // Add new paymentOut
            account.paymentsOut.push({
              amount: exp.amount,
              method: expenseMethod,
              referenceId: expenseRefId,
              remark: `Expense (${exp.remark}) for delivery ${deliveryId}`,
              submittedBy: userId || "system",
              date: new Date(),
            });
          }
        }
      }

      // Save the updated PaymentsAccount
      await account.save({ session });
    }

    // 9. Recalculate totals for billing (totalFuelCharge, totalOtherExpenses)
    billing.calculateTotals();

    // 10. Save Billing after all updates
    await billing.save({ session });

    // 11. Update Location with end location (if provided)
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

    // 12. Commit the transaction and end the session
    session.endSession();

    // 13. Respond with success
    res.status(200).json({ message: "Delivery completed and statuses updated.", delivery });
  } catch (error) {
    console.error("Error processing end-delivery request:", error);
    // Abort the transaction if an error occurred
    if (session.inTransaction()) {
      
    }
    // End the session
    session.endSession();
    // Respond with error
    res.status(500).json({ error: error.message || "Failed to complete delivery and update statuses." });
  }
});










// =========================
// Route: Update Payment for a Billing Entry
// =========================
userRouter.post("/billing/update-payment", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { invoiceNo, paymentAmount, paymentMethod,paymentRemark, userId, date } = req.body;

    // Validate required fields
    if (!invoiceNo || !paymentAmount || !paymentMethod || !userId) {
      
      session.endSession();
      return res.status(400).json({ error: "All fields are required." });
    }

    // Parse payment date, default to now if invalid
    let paymentDate = new Date(date);
    if (isNaN(paymentDate.getTime())) {
      paymentDate = new Date();
    }

    // Find the billing record
    const billing = await Billing.findOne({ invoiceNo: invoiceNo.trim() }).session(session);
    if (!billing) {
      
      session.endSession();
      return res.status(404).json({ error: "Billing not found" });
    }

    // Find the user
    const user = await User.findById(userId).session(session);
    if (!user) {
      
      session.endSession();
      return res.status(404).json({ error: "User not found." });
    }

    const parsedPaymentAmount = parseFloat(paymentAmount);
    if (isNaN(parsedPaymentAmount) || parsedPaymentAmount <= 0) {
      
      session.endSession();
      return res.status(400).json({ error: "Invalid payment amount." });
    }

    const referenceId = "PAY" + Date.now().toString();

    // Create payment entries
    const paymentEntry = {
      amount: parsedPaymentAmount,
      method: paymentMethod.trim(),
      date: paymentDate,
      referenceId: referenceId,
      invoiceNo: invoiceNo.trim(),
      remark: `Bill ${invoiceNo.trim()} : Remark ${paymentRemark}`
    };

    const accountPaymentEntry = {
      amount: parsedPaymentAmount,
      method: paymentMethod.trim(),
      referenceId: referenceId,
      remark: `Bill ${invoiceNo.trim()} : Remark ${paymentRemark}`,
      submittedBy: userId,
      date: paymentDate,
    };

    const customerPaymentEntry = {
      amount: parsedPaymentAmount,
      method: paymentMethod.trim(),
      remark: `Bill ${invoiceNo.trim()}  : Remark ${paymentRemark}`,
      submittedBy: userId,
      date: paymentDate,
      referenceId: referenceId,
      invoiceNo: invoiceNo.trim(),
    };

    // Update PaymentsAccount
    const account = await PaymentsAccount.findOne({ accountId: paymentMethod.trim() }).session(session);
    if (!account) {
      
      session.endSession();
      return res.status(404).json({ message: 'Payment account not found' });
    }

    account.paymentsIn.push(accountPaymentEntry);
    await account.save({ session });

    // Add the new payment to billing
    billing.payments.push(paymentEntry);

    // Recalculate the total payments received
    billing.billingAmountReceived = billing.payments.reduce(
      (total, payment) => total + (payment.amount || 0),
      0
    );

    // Calculate net amount after discount
    const netAmount = billing.grandTotal || 0;

    // Update the payment status
    if (billing.billingAmountReceived >= netAmount) {
      billing.paymentStatus = "Paid";
    } else if (billing.billingAmountReceived > 0) {
      billing.paymentStatus = "Partial";
    } else {
      billing.paymentStatus = "Unpaid";
    }

    await billing.save({ session });

    // Update CustomerAccount
    let customerAccount = await CustomerAccount.findOne({ customerId: billing.customerId.trim() }).session(session);
    if (!customerAccount) {
      // Create new customer account if not found
      customerAccount = new CustomerAccount({
        customerId: billing.customerId.trim(),
        customerName: billing.customerName.trim(),
        customerAddress: billing.customerAddress.trim(),
        customerContactNumber: billing.customerContactNumber?.trim(),
        bills: [],
        payments: [],
      });
    }

    customerAccount.payments.push(customerPaymentEntry);

    // Recalculate totalBillAmount, paidAmount, pendingAmount
    customerAccount.totalBillAmount = customerAccount.bills.reduce(
      (acc, bill) => acc + (bill.billAmount || 0),
      0
    );
    customerAccount.paidAmount = customerAccount.payments.reduce(
      (acc, payment) => acc + (payment.amount || 0),
      0
    );
    customerAccount.pendingAmount = customerAccount.totalBillAmount - customerAccount.paidAmount;

    await customerAccount.save({ session });

    // Commit the transaction
    session.endSession();

    res.status(200).json({
      message: "Payment updated successfully.",
      paymentStatus: billing.paymentStatus,
    });
  } catch (error) {
    console.error("Error updating payment:", error);

    // Abort transaction on error
    if (session.inTransaction()) {
      
    }
    session.endSession();

    res.status(500).json({ error: error.message || "Failed to update payment." });
  }
});





// Update the route to fetch all locations for a given invoice number
userRouter.get('/locations/invoice/:invoiceNo', async (req, res) => {
  try {
    const invoiceNo = req.params.invoiceNo;

    console.log(invoiceNo);
    // Fetch all location documents related to the invoice number
    const locations = await Location.find({ invoiceNo });

    if (!locations || locations.length === 0) {
      return res.status(404).json({ message: 'No locations found for this invoice' });
    }

    res.json(locations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching locations' });
  }
});



userRouter.get('/allusers/all', async (req, res) =>{
  try{
      const allUsers = await User.find()
      res.status(200).json(allUsers)
  }catch (error){
      res.status(500).json({message: "Error Fetching"})
  }
});

userRouter.get('/salesmen/all', async (req, res) => {
  try{
      const allUsers = await User.find()
      res.status(200).json(allUsers)
  }catch (error){
      res.status(500).json({message: "Error Fetching"})
  }
});


userRouter.get('/alllogs/all', async (req,res)=>{
  try{
      const allLogs = await Log.find().sort({createdAt: -1})
      res.status(200).json(allLogs)
  }catch (error){
      res.status(500).json({message: "Error Fetching"})
  }
})

userRouter.post('/alllogs/all', async (req,res)=>{
  try{
      const allLogs = await Log.deleteMany()
      res.status(200).json(allLogs)
  }catch (error){
      res.status(500).json({message: "Error Fetching"})
  }
});

userRouter.get('/all/deliveries', async (req, res) => {
  try {
    const deliveries = await Location.find({});
    res.json(deliveries);
  } catch (error) {
    console.error('Error fetching deliveries:', error);
    res.status(500).json({ message: 'Error fetching deliveries' });
  }
});


userRouter.get('/driver/getPSratio/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ item_id: req.params.id });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.psRatio === undefined || product.psRatio === null || isNaN(parseFloat(product.psRatio))) {
      return res.status(400).json({ message: 'Invalid PS Ratio for this product' });
    }

    const psRatio = parseFloat(product.psRatio);
    return res.status(200).json({ psRatio });
  } catch (error) {
    console.error('Error fetching PS ratio:', error);
    return res.status(500).json({ message: 'Error fetching PS Ratio' });
  }
});






export default userRouter;
