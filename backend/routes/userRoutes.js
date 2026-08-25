const express = require('express');
const User = require('../models/User');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const Question = require('../models/Question');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

const sanitizeAttempt = (attempt) => {
  const data = attempt.toObject ? attempt.toObject() : { ...attempt };
  delete data.answers;
  return data;
};

router.get('/me', authenticateUser, async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  return res.status(200).json({ success: true, data: { user } });
});

router.get('/me/dashboard', authenticateUser, async (req, res) => {
  const [availableExams, attempts, totalAttempts, averageScore, bestScore] = await Promise.all([
    Exam.find({ status: 'published' }).sort({ createdAt: -1 }),
    ExamAttempt.find({ userId: req.user._id })
      .populate('examId', 'title subject duration totalMarks passingMarks status')
      .select('-answers')
      .sort({ submittedAt: -1 }),
    ExamAttempt.countDocuments({ userId: req.user._id }),
    ExamAttempt.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: null, average: { $avg: '$percentage' } } },
    ]),
    ExamAttempt.find({ userId: req.user._id }).sort({ score: -1 }).limit(1),
  ]);

  const dashboard = {
    welcome: `Welcome back, ${req.user.name}!`,
    availableExams,
    upcomingExams: availableExams.filter((exam) => exam.startDate && new Date(exam.startDate) > new Date()),
    completedExams: attempts.filter((attempt) => attempt.status === 'submitted' || attempt.status === 'auto-submitted').map(sanitizeAttempt),
    recentResults: attempts.slice(0, 5).map(sanitizeAttempt),
    totalExamsAttempted: totalAttempts,
    averageScore: Number(averageScore[0]?.average || 0),
    bestScore: bestScore[0]?.score || 0,
  };

  return res.status(200).json({ success: true, data: { dashboard } });
});

router.get('/me/attempts', authenticateUser, async (req, res) => {
  const attempts = await ExamAttempt.find({ userId: req.user._id })
    .populate('examId', 'title subject duration')
    .sort({ createdAt: -1 });

  return res.status(200).json({ success: true, data: { attempts: attempts.map(sanitizeAttempt) } });
});

router.get('/me/attempts/:id', authenticateUser, async (req, res) => {
  const attempt = await ExamAttempt.findOne({ _id: req.params.id, userId: req.user._id })
    .populate('examId', 'title subject duration totalMarks passingMarks');

  if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });

  const attemptData = attempt.toObject();
  delete attemptData.answers;

  if (attempt.status !== 'in-progress') {
    const questions = await Question.find({ examId: attempt.examId._id })
      .select('questionText options correctAnswer marks negativeMarks explanation')
      .sort({ createdAt: 1 })
      .lean();
    const answers = attempt.answers || new Map();

    attemptData.review = questions.map((question) => {
      const answer = answers instanceof Map
        ? answers.get(question._id.toString())
        : answers[question._id.toString()];
      return {
        questionId: question._id,
        questionText: question.questionText,
        options: question.options,
        selectedAnswer: answer === undefined ? null : answer,
        correctAnswer: question.correctAnswer,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
        explanation: question.explanation,
      };
    });
  }

  return res.status(200).json({ success: true, data: { attempt: attemptData } });
});

module.exports = router;
