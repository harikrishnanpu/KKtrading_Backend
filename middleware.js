import Log from "./models/Logmodal.js";

const logMiddleware = async (req, res, next) => {
  // Optionally skip GET requests; remove if you want to log GET requests too
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
      username: user ? user.name : 'Guest',
      action: `${req.method} ${req.originalUrl}`,
      details: JSON.stringify({
        params: req.params,
        query: req.query,
        body: req.body,
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

export default logMiddleware;
