import jwt from 'jsonwebtoken';

export const generateToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      isSeller: user.isSeller,
    },
    process.env.JWT_SECRET || 'somethingsecret',
    {
      expiresIn: '30d',
    }
  );
};

export const isAuth = (req, res, next) => {
  next();
};


export const isAdmin = (req, res, next) => {
    next();
};

export const isSeller = (req, res, next) => {
    next();
};
export const isSellerOrAdmin = (req, res, next) => {
    next();
};