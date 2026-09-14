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

const getResults = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const query = { status: { $in: ['submitted', 'auto-submitted'] } };
    if (req.query.examId) {
      if (!mongoose.isValidObjectId(req.query.examId)) {
        return res.status(400).json({ success: false, message: 'Exam filter is invalid' });
      }
      query.examId = req.query.examId;
    }
    if (req.query.userId) {
      if (!mongoose.isValidObjectId(req.query.userId)) {
        return res.status(400).json({ success: false, message: 'User filter is invalid' });
      }
      query.userId = req.query.userId;
    }
    if (req.query.search) {
      const term = String(req.query.search).trim().slice(0, 100);
      const regex = new RegExp(escapeRegex(term), 'i');
      const matchedUsers = await User.find({ $or: [{ name: regex }, { email: regex }] }).select('_id').limit(200).lean();
      query.userId = { $in: matchedUsers.map((user) => user._id) };
    }
    const [attempts, total] = await Promise.all([
      ExamAttempt.find(query)
      .populate('userId', 'name email')
      .populate('examId', 'title subject')
      .select('-answers -questionSnapshot')
      .sort({ submittedAt: -1 })
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

module.exports = { getAdminStats, getUsers, toggleUserStatus, getResults };
