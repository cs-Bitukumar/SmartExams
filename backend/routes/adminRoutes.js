const express = require('express');
const {
  exportResults,
  getAdminStats,
  getAttemptDetail,
  getResults,
  getStudentDetail,
  getUsers,
  reviewAttempt,
  toggleUserStatus,
} = require('../controllers/adminController');
const { authenticateUser, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', authenticateUser, requireAdmin, getAdminStats);
router.get('/users', authenticateUser, requireAdmin, getUsers);
router.get('/users/:id', authenticateUser, requireAdmin, getStudentDetail);
router.patch('/users/:id/toggle-status', authenticateUser, requireAdmin, toggleUserStatus);
router.get('/results/export', authenticateUser, requireAdmin, exportResults);
router.get('/results', authenticateUser, requireAdmin, getResults);
router.get('/attempts/:id', authenticateUser, requireAdmin, getAttemptDetail);
router.post('/attempts/:id/review', authenticateUser, requireAdmin, reviewAttempt);

module.exports = router;
