const mongoose = require('mongoose');

const attemptQuestionSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  questionText: { type: String, required: true },
  options: { type: [String], required: true },
  correctAnswer: { type: Number, required: true },
  marks: { type: Number, required: true },
  negativeMarks: { type: Number, default: 0 },
  explanation: { type: String, default: '' },
  // Persisted per-attempt option shuffle. Stores the display order as indexes
  // into the frozen options array so a refresh never reshuffles an attempt.
  optionOrder: { type: [Number], default: undefined },
}, { _id: false });

const integrityEventSchema = new mongoose.Schema({
  type: { type: String, required: true },
  at: { type: Date, default: Date.now },
}, { _id: false });

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
  markedForReview: {
    type: Map,
    of: Boolean,
    default: new Map(),
  },
  startedAt: {
    type: Date,
    required: true,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  durationMinutes: {
    type: Number,
    min: 1,
  },
  questionSnapshot: {
    type: [attemptQuestionSchema],
    default: [],
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
  // Manual result workflow: when the exam requires admin review, a submitted
  // attempt stays in "pending-review" (score hidden from the student) until
  // an admin publishes it. Older attempts without this field are treated as
  // "published" so existing results keep working.
  resultStatus: {
    type: String,
    enum: ['published', 'pending-review'],
    default: 'published',
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  adminFeedback: {
    type: String,
    default: '',
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
  violations: {
    type: Number,
    default: 0,
    min: 0,
  },
  integrityEvents: {
    type: [integrityEventSchema],
    default: [],
  },
}, {
  timestamps: true,
});

examAttemptSchema.index({ userId: 1, examId: 1, status: 1 });
examAttemptSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('ExamAttempt', examAttemptSchema);
