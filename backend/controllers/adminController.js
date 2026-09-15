const mongoose = require('mongoose');
const User = require('../models/User');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const Question = require('../models/Question');
const { getTimeTakenSeconds } = require('../services/attemptService');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const resultSortFields = new Set(['submittedAt', 'score', 'percentage', 'createdAt']);
const resultSortField = (query) => (resultSortFields.has(String(query.sort)) ? String(query.sort) : 'submittedAt');
const resultSortOrder = (query) => (String(query.order).toLowerCase() === 'asc' ? 1 : -1);

const getPagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
};

const getAdminStats = async (req, res, next) => {
  try {
    const [students, totalExams, publishedExams, totalAttempts, totalQuestions, averageScore] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Exam.countDocuments(),
      Exam.countDocuments({ status: 'published' }),
      ExamAttempt.countDocuments(),
      Question.countDocuments(),
      ExamAttempt.aggregate([
        { $match: { status: { $in: ['submitted', 'auto-submitted'] } } },
        { $group: { _id: null, average: { $avg: '$percentage' } } },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalStudents: students,
          totalExams,
          publishedExams,
          totalAttempts,
          totalQuestions,
          averageScore: Number(averageScore[0]?.average || 0),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const { role, search } = req.query;
    const query = {};

    if (role) {
      if (!['student', 'admin'].includes(role)) return res.status(400).json({ success: false, message: 'Role filter is invalid' });
      query.role = role;
    }
    if (search) {
      const searchTerm = String(search).trim().slice(0, 100);
      query.$or = [
        { name: { $regex: escapeRegex(searchTerm), $options: 'i' } },
        { email: { $regex: escapeRegex(searchTerm), $options: 'i' } },
      ];
    }
    const { page, limit, skip } = getPagination(req.query);

    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: { users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
    });
  } catch (error) {
    next(error);
  }
};

const toggleUserStatus = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;

    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot disable your own admin account without confirmation',
      });
    }

    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean value',
      });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.role !== 'student') {
      return res.status(400).json({ success: false, message: 'Only student accounts can be managed here' });
    }

    user.isActive = isActive;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User ${isActive ? 'enabled' : 'disabled'} successfully`,
      data: { user: { id: user._id, name: user.name, isActive: user.isActive } },
    });
  } catch (error) {
    next(error);
  }
};

// Shared filter builder so /results and /results/export always apply identical rules.
const buildResultsFilter = async (req) => {
  const query = { status: { $in: ['submitted', 'auto-submitted'] } };
  if (['submitted', 'auto-submitted'].includes(String(req.query.status))) {
    query.status = String(req.query.status);
  }
  if (req.query.examId) {
    if (!mongoose.isValidObjectId(req.query.examId)) return { error: 'Exam filter is invalid' };
    query.examId = req.query.examId;
  }
  if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) return { error: 'User filter is invalid' };
    query.userId = req.query.userId;
  }
  if (req.query.search) {
    const term = String(req.query.search).trim().slice(0, 100);
    const regex = new RegExp(escapeRegex(term), 'i');
    const matchedUsers = await User.find({ $or: [{ name: regex }, { email: regex }] })
      .select('_id')
      .limit(200)
      .lean();
    query.userId = { $in: matchedUsers.map((user) => user._id) };
  }
  return { query };
};

const getResults = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { query, error } = await buildResultsFilter(req);
    if (error) return res.status(400).json({ success: false, message: error });
    const [attempts, total] = await Promise.all([
      ExamAttempt.find(query)
      .populate('userId', 'name email')
      .populate('examId', 'title subject')
      .select('-answers -questionSnapshot')
      .sort({ [resultSortField(req.query)]: resultSortOrder(req.query) })
      .skip(skip)
      .limit(limit),
      ExamAttempt.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: { attempts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
    });
  } catch (error) {
    next(error);
  }
};

const getStudentDetail = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user identifier' });
    }

    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const [attempts, summaryRows] = await Promise.all([
      ExamAttempt.find({ userId: user._id })
        .populate('examId', 'title subject totalMarks passingMarks status')
        .select('-answers -questionSnapshot')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      ExamAttempt.aggregate([
        { $match: { userId: user._id, status: { $in: ['submitted', 'auto-submitted'] } } },
        {
          $group: {
            _id: null,
            attempts: { $sum: 1 },
            averagePercentage: { $avg: '$percentage' },
            bestPercentage: { $max: '$percentage' },
            passed: { $sum: { $cond: ['$passed', 1, 0] } },
          },
        },
      ]),
    ]);

    const summary = summaryRows[0] || {};

    return res.status(200).json({
      success: true,
      data: {
        user,
        attempts: attempts.map((attempt) => ({
          ...attempt,
          timeTakenSeconds: getTimeTakenSeconds(attempt),
        })),
        summary: {
          attempts: Number(summary.attempts || 0),
          averagePercentage: Number(summary.averagePercentage || 0),
          bestPercentage: Number(summary.bestPercentage || 0),
          passed: Number(summary.passed || 0),
          inProgress: attempts.filter((attempt) => attempt.status === 'in-progress').length,
        },
        pagination: { total: attempts.length, limit: 50 },
      },
    });
  } catch (error) {
    next(error);
  }
};

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const exportResults = async (req, res, next) => {
  try {
    const { query, error } = await buildResultsFilter(req);
    if (error) return res.status(400).json({ success: false, message: error });

    const attempts = await ExamAttempt.find(query)
      .populate('userId', 'name email')
      .populate('examId', 'title subject')
      .select('-answers -questionSnapshot')
      .sort({ submittedAt: -1 })
      .limit(5000)
      .lean();

    const header = ['Student', 'Email', 'Exam', 'Subject', 'Score', 'Total Marks', 'Percentage', 'Correct', 'Incorrect', 'Unanswered', 'Passed', 'Status', 'Submitted At'];
    const rows = attempts.map((attempt) => [
      attempt.userId?.name || 'Unknown',
      attempt.userId?.email || '',
      attempt.examId?.title || 'Exam',
      attempt.examId?.subject || '',
      attempt.score,
      attempt.totalMarks,
      Math.round(Number(attempt.percentage || 0) * 100) / 100,
      attempt.correctAnswers,
      attempt.incorrectAnswers,
      attempt.unanswered,
      attempt.passed ? 'Yes' : 'No',
      attempt.status,
      attempt.submittedAt,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="smartexams-results-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(200).send(`${csv}\r\n`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  exportResults,
  getAdminStats,
  getResults,
  getStudentDetail,
  getUsers,
  toggleUserStatus,
};
