const express = require('express');
const { registerUser, loginUser, logoutUser, getCurrentUser } = require('../controllers/authController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', authenticateUser, logoutUser);
router.get('/me', authenticateUser, getCurrentUser);

module.exports = router;
