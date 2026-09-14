const express = require('express');
const rateLimit = require('express-rate-limit');
const { registerUser, loginUser, logoutUser, getCurrentUser } = require('../controllers/authController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
});

router.post('/register', authLimiter, registerUser);
router.post('/login', authLimiter, loginUser);
router.post('/logout', authenticateUser, logoutUser);
router.get('/me', authenticateUser, getCurrentUser);

module.exports = router;
