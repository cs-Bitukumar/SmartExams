const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateUser = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;
    const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const token = req.cookies?.token || bearerToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'development-only-secret');
    if (!secret) throw new Error('Server authentication is not configured');
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.id).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is invalid or inactive',
      });
    }

    req.user = user;
    next();
  } catch (_error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }

  next();
};

const requireStudent = (req, res, next) => {
  if (!req.user || req.user.role !== 'student') {
    return res.status(403).json({
      success: false,
      message: 'Student access required',
    });
  }

  next();
};

module.exports = { authenticateUser, requireAdmin, requireStudent };
