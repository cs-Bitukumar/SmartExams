const jwt = require('jsonwebtoken');
const validator = require('validator');
const User = require('../models/User');

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') throw new Error('Server authentication is not configured');
  return 'development-only-secret';
};

const generateToken = (userId) => jwt.sign(
  { id: userId },
  getJwtSecret(),
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
);

const passwordIsStrong = (password) => validator.isStrongPassword(password, {
  minLength: 8,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 0,
});

const setAuthCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const registerUser = async (req, res, next) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (![name, email, password, confirmPassword].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and confirm password are required',
      });
    }

    if (!validator.isEmail(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email address',
      });
    }

    if (name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({ success: false, message: 'Full name must be between 2 and 100 characters' });
    }

    if (!passwordIsStrong(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters and include uppercase, lowercase, and a number',
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    const normalizedEmail = validator.normalizeEmail(email.trim()) || email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email',
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'student',
    });

    const token = generateToken(user._id);
    setAuthCookie(res, token);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account already exists for this email address' });
    }
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    if (!validator.isEmail(email.trim())) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }

    const normalizedEmail = validator.normalizeEmail(email.trim()) || email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const token = generateToken(user._id);
    setAuthCookie(res, token);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const logoutUser = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

const getCurrentUser = async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');

  return res.status(200).json({
    success: true,
    data: { user },
  });
};

module.exports = { registerUser, loginUser, logoutUser, getCurrentUser };
