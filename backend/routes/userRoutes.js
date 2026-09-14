const express = require('express');
const User = require('../models/User');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const Question = require('../models/Question');
const { authenticateUser, requireStudent } = require('../middleware/auth');
const { getAttemptQuestions, sanitizeAttemptForStudent } = require('../services/attemptService');

const router = express.Router();

const completedStatuses = ['submitted', 'auto-submitted'];

router.get('/me', authenticateUser, async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  return res.status(200).json({ success: true, data: { user } });
});

router.get('/me/dashboard', authenticateUser, requireStudent, async (req, res, next) => {
  try {
    const now = new Date();
    const availabilityFilter = {
      status: 'published',
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ],
    };
    const [availableExams, completedAttempts, inProgressAttempts, analytics] = await Promise.all([
      Exam.find(availabilityFilter).sort({ createdAt: -1 }).lean(),
      ExamAttempt.find({ userId: req.user._id, status: { $in: completedStatuses } })
        .populate('examId', 'title subject duration totalMarks passingMarks status')
        .select('-answers -questionSnapshot')
        .sort({ submittedAt: -1 })
        .lean(),
      ExamAttempt.find({ userId: req.user._id, status: 'in-progress' })
        .populate('examId', 'title subject duration')
        .select('-questionSnapshot')
        .sort({ startedAt: -1 })
        .lean(),
      ExamAttempt.aggregate([
        { $match: { userId: req.user._id, status: { $in: completedStatuses } } },
        {
          $group: {
            _id: null,
            averageScore: { $avg: '$percentage' },
            bestScore: { $max: '$score' },
            correct: { $sum: '$correctAnswers' },
            incorrect: { $sum: '$incorrectAnswers' },
            answeredQuestions: { $sum: { $add: ['$correctAnswers', '$incorrectAnswers'] } },
          },
        },
      ]),
    ]);

    const questionCounts = await Question.aggregate([
      { $match: { examId: { $in: availableExams.map((exam) => exam._id) } } },
      { $group: { _id: '$examId', count: { $sum: 1 } } },
    ]);
    const countsByExamId = new Map(questionCounts.map((item) => [item._id.toString(), item.count]));
    const stats = analytics[0] || {};
    const answerCount = Number(stats.correct || 0) + Number(stats.incorrect || 0);
    const safeInProgress = inProgressAttempts.map((attempt) => sanitizeAttemptForStudent(attempt, { includeAnswers: true }));

    return res.status(200).json({
      success: true,
      data: {
        dashboard: {
          welcome: `Welcome back, ${req.user.name}!`,
          availableExams: availableExams.map((exam) => ({
            ...exam,
            questionCount: countsByExamId.get(exam._id.toString()) || 0,
          })),
          upcomingExams: [],
          completedExams: completedAttempts,
          recentResults: completedAttempts.slice(0, 5),
          inProgressAttempts: safeInProgress,
          totalExamsAttempted: completedAttempts.length,
          averageScore: Number(stats.averageScore || 0),
          bestScore: Number(stats.bestScore || 0),
          totalQuestionsAttempted: Number(stats.answeredQuestions || 0),
          accuracy: answerCount ? (Number(stats.correct || 0) / answerCount) * 100 : 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me/attempts', authenticateUser, requireStudent, async (req, res, next) => {
  try {
    const attempts = await ExamAttempt.find({ userId: req.user._id })
      .populate('examId', 'title subject duration')
      .select('-answers -questionSnapshot')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: { attempts } });
  } catch (error) {
    next(error);
  }
});

router.get('/me/attempts/:id', authenticateUser, requireStudent, async (req, res, next) => {
  try {
    const attempt = await ExamAttempt.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('examId', 'title subject duration totalMarks passingMarks');
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
    if (attempt.status === 'in-progress') {
      return res.status(409).json({ success: false, message: 'This exam is still in progress' });
    }

    const attemptData = sanitizeAttemptForStudent(attempt);
    const questions = await getAttemptQuestions(attempt, Question);
    const answers = attempt.answers instanceof Map ? attempt.answers : new Map(Object.entries(attempt.answers || {}));
    attemptData.review = questions.map((question) => {
      const answer = answers.get(question.questionId.toString());
      return {
        questionId: question.questionId,
        questionText: question.questionText,
        options: question.options,
        selectedAnswer: answer === undefined ? null : answer,
        correctAnswer: question.correctAnswer,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
        explanation: question.explanation,
      };
    });
    return res.status(200).json({ success: true, data: { attempt: attemptData } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
