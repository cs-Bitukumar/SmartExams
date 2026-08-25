const User = require('../models/User');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');

const getAdminStats = async (req, res, next) => {
  try {
    const [students, totalExams, publishedExams, totalAttempts, averageScore] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Exam.countDocuments(),
      Exam.countDocuments({ status: 'published' }),
      ExamAttempt.countDocuments(),
      ExamAttempt.aggregate([
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

    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query).select('-password').sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: { users },
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
    const attempts = await ExamAttempt.find()
      .populate('userId', 'name email')
      .populate('examId', 'title subject')
      .sort({ submittedAt: -1 });

    return res.status(200).json({
      success: true,
      data: { attempts },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAdminStats, getUsers, toggleUserStatus, getResults };
