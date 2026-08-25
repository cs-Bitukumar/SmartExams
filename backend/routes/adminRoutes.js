const express = require('express');
const { getAdminStats, getUsers, toggleUserStatus, getResults } = require('../controllers/adminController');
const { authenticateUser, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', authenticateUser, requireAdmin, getAdminStats);
router.get('/users', authenticateUser, requireAdmin, getUsers);
router.patch('/users/:id/toggle-status', authenticateUser, requireAdmin, toggleUserStatus);
router.get('/results', authenticateUser, requireAdmin, getResults);

module.exports = router;
