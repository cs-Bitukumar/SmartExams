const User = require('../models/User');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const getPagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
};

const getAdminStats = async (req, res, next) => {
  try {
    const [students, totalExams, publishedExams, totalAttempts, averageScore] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Exam.countDocuments(),
      Exam.countDocuments({ status: 'published' }),
      ExamAttempt.countDocuments(),
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
    if (req.query.examId) query.examId = req.query.examId;
    if (req.query.userId) query.userId = req.query.userId;
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
