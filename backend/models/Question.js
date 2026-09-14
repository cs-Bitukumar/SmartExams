const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true,
  },
  questionText: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true,
    maxlength: 5000,
  },
  options: {
    type: [String],
    validate: {
      validator: function validateOptions(v) {
        return Array.isArray(v)
          && v.length >= 2
          && v.length <= 6
          && v.every((option) => typeof option === 'string' && option.trim().length > 0 && option.length <= 2000);
      },
      message: 'Each question must have between 2 and 6 options.',
    },
    required: true,
  },
  correctAnswer: {
    type: Number,
    required: [true, 'Correct option index is required'],
    min: 0,
    max: 5,
  },
  marks: {
    type: Number,
    default: 1,
    min: 1,
  },
  negativeMarks: {
    type: Number,
    default: 0,
    min: 0,
  },
  explanation: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

questionSchema.index({ examId: 1, createdAt: 1 });

module.exports = mongoose.model('Question', questionSchema);
