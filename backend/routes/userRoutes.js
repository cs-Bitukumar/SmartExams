const express = require('express');
const User = require('../models/User');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const Question = require('../models/Question');
const { authenticateUser, requireStudent } = require('../middleware/auth');
const { getAttemptQuestions, getTimeTakenSeconds, sanitizeAttemptForStudent } = require('../services/attemptService');

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
    const answeredCount = Number(attempt.correctAnswers || 0) + Number(attempt.incorrectAnswers || 0);
    attemptData.timeTakenSeconds = getTimeTakenSeconds(attempt);
    attemptData.accuracy = answeredCount ? (Number(attempt.correctAnswers || 0) / answeredCount) * 100 : 0;
    attemptData.review = questions.map((question) => {
      const answer = answers.get(question.questionId.toString());
      const selectedAnswer = answer === undefined || answer === null || answer === '' ? null : Number(answer);
      const outcome = selectedAnswer === null
        ? 'skipped'
        : (selectedAnswer === question.correctAnswer ? 'correct' : 'incorrect');
      return {
        questionId: question.questionId,
        questionText: question.questionText,
        options: question.options,
        selectedAnswer,
        correctAnswer: question.correctAnswer,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
        explanation: question.explanation,
        outcome,
      };
    });
    return res.status(200).json({ success: true, data: { attempt: attemptData } });
  } catch (error) {
    next(error);
  }
});

// Real database-driven performance analytics for the signed-in student.
// No synthetic data: an empty history is reported as hasData: false.
router.get('/me/analytics', authenticateUser, requireStudent, async (req, res, next) => {
  try {
    const match = { userId: req.user._id, status: { $in: completedStatuses } };
    const [summaryRows, subjectRows, history] = await Promise.all([
      ExamAttempt.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            attempts: { $sum: 1 },
            averagePercentage: { $avg: '$percentage' },
            bestPercentage: { $max: '$percentage' },
            correct: { $sum: '$correctAnswers' },
            incorrect: { $sum: '$incorrectAnswers' },
            unanswered: { $sum: '$unanswered' },
            timeSpentMs: { $sum: { $subtract: ['$submittedAt', '$startedAt'] } },
          },
        },
      ]),
      ExamAttempt.aggregate([
        { $match: match },
        { $lookup: { from: 'exams', localField: 'examId', foreignField: '_id', as: 'exam' } },
        { $unwind: '$exam' },
        {
          $group: {
            _id: '$exam.subject',
            attempts: { $sum: 1 },
            averagePercentage: { $avg: '$percentage' },
            bestPercentage: { $max: '$percentage' },
            correct: { $sum: '$correctAnswers' },
            incorrect: { $sum: '$incorrectAnswers' },
            unanswered: { $sum: '$unanswered' },
          },
        },
        { $sort: { averagePercentage: -1 } },
      ]),
      ExamAttempt.find(match)
        .populate('examId', 'title subject')
        .select('score totalMarks percentage passed submittedAt startedAt correctAnswers incorrectAnswers unanswered examId')
        .sort({ submittedAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const summary = summaryRows[0] || {};
    const answered = Number(summary.correct || 0) + Number(summary.incorrect || 0);
    const subjects = subjectRows.map((row) => {
      const subjectAnswered = Number(row.correct || 0) + Number(row.incorrect || 0);
      return {
        subject: row._id || 'General',
        attempts: row.attempts,
        averagePercentage: Number(row.averagePercentage || 0),
        bestPercentage: Number(row.bestPercentage || 0),
        correct: Number(row.correct || 0),
        incorrect: Number(row.incorrect || 0),
        unanswered: Number(row.unanswered || 0),
        accuracy: subjectAnswered ? (Number(row.correct || 0) / subjectAnswered) * 100 : 0,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        analytics: {
          hasData: Number(summary.attempts || 0) > 0,
          summary: {
            attempts: Number(summary.attempts || 0),
            averagePercentage: Number(summary.averagePercentage || 0),
            bestPercentage: Number(summary.bestPercentage || 0),
            correct: Number(summary.correct || 0),
            incorrect: Number(summary.incorrect || 0),
            unanswered: Number(summary.unanswered || 0),
            questionsAttempted: Number(summary.correct || 0) + Number(summary.incorrect || 0) + Number(summary.unanswered || 0),
            accuracy: answered ? (Number(summary.correct || 0) / answered) * 100 : 0,
            timeSpentSeconds: Math.max(0, Math.round(Number(summary.timeSpentMs || 0) / 1000)),
          },
          subjects,
          weakAreas: subjects.filter((item) => item.accuracy < 60).map((item) => item.subject),
          history: history.map((attempt) => ({
            attemptId: attempt._id,
            examId: attempt.examId?._id || null,
            examTitle: attempt.examId?.title || 'Exam',
            subject: attempt.examId?.subject || 'General',
            score: Number(attempt.score || 0),
            totalMarks: Number(attempt.totalMarks || 0),
            percentage: Number(attempt.percentage || 0),
            passed: Boolean(attempt.passed),
            correctAnswers: Number(attempt.correctAnswers || 0),
            incorrectAnswers: Number(attempt.incorrectAnswers || 0),
            unanswered: Number(attempt.unanswered || 0),
            submittedAt: attempt.submittedAt,
            timeTakenSeconds: getTimeTakenSeconds(attempt),
          })),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
