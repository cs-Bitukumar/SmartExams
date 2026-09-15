const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  getExams,
  getExamById,
  createExam,
  updateExam,
  deleteExam,
  duplicateExam,
  publishExam,
  getQuestionsByExam,
  createQuestion,
  updateQuestion,
  deleteQuestion,
} = require('../controllers/examController');
const { authenticateUser, requireAdmin, requireStudent } = require('../middleware/auth');
const {
  getAttemptState,
  reportViolation,
  saveAnswer,
  startAttempt,
  submitAttempt,
} = require('../controllers/attemptController');

const router = express.Router();

// Integrity pings fire on tab-hide/blur and are advisory only. A tight per-attempt
// cap stops a tampered client from growing the attempt document with spam.
const violationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => `${req.user?._id || 'anon'}:${req.params.attemptId || 'unknown'}`,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

router.get('/', authenticateUser, getExams);
router.get('/:id', authenticateUser, getExamById);
router.post('/:examId/start', authenticateUser, requireStudent, startAttempt);
router.get('/attempts/:attemptId', authenticateUser, requireStudent, getAttemptState);
router.put('/attempts/:attemptId/answers', authenticateUser, requireStudent, saveAnswer);
router.post('/attempts/:attemptId/submit', authenticateUser, requireStudent, submitAttempt);
router.post('/attempts/:attemptId/violations', authenticateUser, requireStudent, violationLimiter, reportViolation);
router.post('/', authenticateUser, requireAdmin, createExam);
router.put('/:id', authenticateUser, requireAdmin, updateExam);
router.post('/:id/publish', authenticateUser, requireAdmin, publishExam);
router.delete('/:id', authenticateUser, requireAdmin, deleteExam);
router.post('/:id/duplicate', authenticateUser, requireAdmin, duplicateExam);

router.get('/:examId/questions', authenticateUser, getQuestionsByExam);
router.post('/:examId/questions', authenticateUser, requireAdmin, createQuestion);
router.put('/questions/:id', authenticateUser, requireAdmin, updateQuestion);
router.delete('/questions/:id', authenticateUser, requireAdmin, deleteQuestion);

module.exports = router;
