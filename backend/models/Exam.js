const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Exam title is required'],
    trim: true,
    maxlength: 160,
  },
  description: {
    type: String,
    required: [true, 'Exam description is required'],
    trim: true,
    maxlength: 5000,
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    maxlength: 120,
  },
  duration: {
    type: Number,
    required: [true, 'Duration is required'],
    min: 1,
  },
  totalMarks: {
    type: Number,
    required: [true, 'Total marks are required'],
    min: 1,
  },
  passingMarks: {
    type: Number,
    required: [true, 'Passing marks are required'],
    min: 0,
  },
  negativeMarking: {
    type: Boolean,
    default: false,
  },
  negativeMarkValue: {
    type: Number,
    default: 0,
    min: 0,
  },
  instructions: {
    type: [String],
    default: [],
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'closed'],
    default: 'draft',
  },
  startDate: Date,
  endDate: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

examSchema.index({ status: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Exam', examSchema);
