// middleware/logger.js

import Log from "./models/Logmodal.js";

const logMiddleware = async (req, res, next) => {
    if (req.logRecorded || req.method === 'GET') {
        return next(); // Skip if log already recorded for this request or if the request is a GET request
      }

  try {
    // Extract user information from request header
    const userHeader = req.headers['user'];
    let user = null;

    if (userHeader) {
      user = JSON.parse(userHeader);
      
      const logEntry = new Log({
          user: user ? user.userId : null,
          username: user ? user.username : 'Guest',
          action: `${req.method} ${req.originalUrl}`,
          details: JSON.stringify({
              params: req.params,
              query: req.query,
              body: req.body,
            }),
        });
        
        await logEntry.save(); // Save the log entry to MongoDB
        req.logRecorded = true; // Mark log as recorded for this request
    }
  } catch (error) {
    console.error('Error logging request:', error);
  }
  next(); // Proceed to the next middleware
};

export default logMiddleware;