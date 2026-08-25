const mongoose = require('mongoose');

const examAttemptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true,
  },
  answers: {
    type: Map,
    of: Number,
    default: new Map(),
  },
  startedAt: {
    type: Date,
    required: true,
  },
  submittedAt: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['in-progress', 'submitted', 'auto-submitted'],
    default: 'in-progress',
  },
  score: {
    type: Number,
    default: 0,
  },
  totalMarks: {
    type: Number,
    default: 0,
  },
  percentage: {
    type: Number,
    default: 0,
  },
  correctAnswers: {
    type: Number,
    default: 0,
  },
  incorrectAnswers: {
    type: Number,
    default: 0,
  },
  unanswered: {
    type: Number,
    default: 0,
  },
  passed: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

examAttemptSchema.index({ userId: 1, examId: 1, status: 1 });

module.exports = mongoose.model('ExamAttempt', examAttemptSchema);
