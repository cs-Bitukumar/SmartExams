const express = require('express');
const {
  getExams,
  getExamById,
  createExam,
  updateExam,
  deleteExam,
  getQuestionsByExam,
  createQuestion,
  updateQuestion,
  deleteQuestion,
} = require('../controllers/examController');
const { authenticateUser, requireAdmin, requireStudent } = require('../middleware/auth');
const {
  getAttemptState,
  saveAnswer,
  startAttempt,
  submitAttempt,
} = require('../controllers/attemptController');

const router = express.Router();

router.get('/', authenticateUser, getExams);
router.get('/:id', authenticateUser, getExamById);
router.post('/:examId/start', authenticateUser, requireStudent, startAttempt);
router.get('/attempts/:attemptId', authenticateUser, requireStudent, getAttemptState);
router.put('/attempts/:attemptId/answers', authenticateUser, requireStudent, saveAnswer);
router.post('/attempts/:attemptId/submit', authenticateUser, requireStudent, submitAttempt);
router.post('/', authenticateUser, requireAdmin, createExam);
router.put('/:id', authenticateUser, requireAdmin, updateExam);
router.delete('/:id', authenticateUser, requireAdmin, deleteExam);

router.get('/:examId/questions', authenticateUser, getQuestionsByExam);
router.post('/:examId/questions', authenticateUser, requireAdmin, createQuestion);
router.put('/questions/:id', authenticateUser, requireAdmin, updateQuestion);
router.delete('/questions/:id', authenticateUser, requireAdmin, deleteQuestion);

module.exports = router;
