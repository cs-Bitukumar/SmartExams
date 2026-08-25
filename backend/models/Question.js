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
  },
  options: {
    type: [String],
    validate: {
      validator: function validateOptions(v) {
        return v.length >= 2 && v.length <= 6;
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

module.exports = mongoose.model('Question', questionSchema);
