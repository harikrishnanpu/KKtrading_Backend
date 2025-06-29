import jwt from "jsonwebtoken";
import Log from "./models/Logmodal.js";
import User from "./models/userModel.js";

const logMiddleware = async (req, res, next) => {
  
  if (req.method === 'GET') {
    return next();
  }


  try {
    const userHeader = req.headers['user'];
    let user = null;
    if (userHeader) {
      try {
        user = JSON.parse(userHeader);
      } catch (error) {
        console.error('Invalid JSON in user header:', error);
      }
    }

    const logEntry = new Log({
      user: user ? user._id : null,
      username: user ? user.name : req.body.email || 'Guest',
      action: `${req.method} ${req.originalUrl}`,
      details: JSON.stringify({
        params: req.params,
        query: req.query,
        body:  req.url == '/api/users/signin' || req.url == '/api/users/register' ? '' : req.body,
      }),
    });
    
    await logEntry.save(); // Save to MongoDB
    req.logRecorded = true;
    // console.log('Log entry saved successfully');
  } catch (error) {
    console.error('Error logging request:', error);
  }
  
  next();
};



export const useAuth = async (req, res, next) => {
  try {
      const authorization = req.headers.authorization;

      // Check if the token is missing
      if (!authorization) {
        console.log('Token Missing');
        return res.status(401).json({ message: 'Token Missing' });
      }

      // Extract the token
      const accessToken = authorization.split(' ')[1];

    const token =  accessToken;

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, 'SECRET_KEY');
    const user = await User.findById(decoded.userId).select('-password').lean();

    if (!user || !user.isEmployee) {
      return res.status(401).json({ message: 'User not found or removed' });
    }

    req.user = user;
    next();

  } catch (err) {
    next(err)
  }
};




export const useAdminAuth = async (req, res, next) => {
  try {
      const authorization = req.headers.authorization;

      // Check if the token is missing
      if (!authorization) {
        console.log('Token Missing');
        return res.status(401).json({ message: 'Token Missing' });
      }

      // Extract the token
      const accessToken = authorization.split(' ')[1];

    const token =  accessToken;

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'SECRET_KEY');
    const user = await User.findById(decoded.userId).select('-password').lean();

    if (!user || !user.isEmployee || !user.isAdmin) {
      return res.status(401).json({ message: 'user not allowed' });
    }

    req.user = user;
    next();

  } catch (err) {
    return next(err)
  }
};


export const optionalAuth = async (req, res, next) => {
  try {
      const authorization = req.headers.authorization;

      // Check if the token is missing
      if (!authorization) {
        console.log('Token Missing');
        return res.status(401).json({ message: 'Token Missing' });
      }

      // Extract the token
      const accessToken = authorization.split(' ')[1];

    const token =  accessToken;

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'SECRET_KEY');
    const user = await User.findById(decoded.userId).select('-password').lean();
    if (user) req.user = user;

  } catch (err) {
    // silent error — don’t set req.user
  } finally {
    next(); // always proceed
  }
};


export default logMiddleware;
