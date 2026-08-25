const Exam = require('../models/Exam');
const Question = require('../models/Question');
const ExamAttempt = require('../models/ExamAttempt');

const startAttempt = async (req, res, next) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.examId, status: 'published' });
    if (!exam) return res.status(404).json({ success: false, message: 'Published exam not found' });

    const existingAttempt = await ExamAttempt.findOne({
      userId: req.user._id,
      examId: exam._id,
      status: 'in-progress',
    });
    if (existingAttempt) {
      return res.status(200).json({ success: true, data: { attempt: existingAttempt, exam } });
    }

    const attempt = await ExamAttempt.create({
      userId: req.user._id,
      examId: exam._id,
      startedAt: new Date(),
      totalMarks: exam.totalMarks,
    });
    return res.status(201).json({ success: true, data: { attempt, exam } });
  } catch (error) {
    next(error);
  }
};

const submitAttempt = async (req, res, next) => {
  try {
    const attempt = await ExamAttempt.findOne({ _id: req.params.attemptId, userId: req.user._id });
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
    if (attempt.status !== 'in-progress') return res.status(409).json({ success: false, message: 'Attempt has already been submitted' });

    const exam = await Exam.findById(attempt.examId);
    const questions = await Question.find({ examId: exam._id }).select('correctAnswer marks negativeMarks');
    const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    let score = 0;
    let correctAnswers = 0;
    let incorrectAnswers = 0;
    let unanswered = 0;

    questions.forEach((question) => {
      const answer = answers[question._id.toString()];
      if (answer === undefined || answer === null || answer === '') {
        unanswered += 1;
      } else if (Number(answer) === question.correctAnswer) {
        correctAnswers += 1;
        score += question.marks;
      } else {
        incorrectAnswers += 1;
        score -= question.negativeMarks;
      }
    });

    const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
    const percentage = totalMarks ? Math.max(0, (score / totalMarks) * 100) : 0;
    attempt.answers = answers;
    attempt.score = Math.max(0, score);
    attempt.totalMarks = totalMarks || exam.totalMarks;
    attempt.percentage = percentage;
    attempt.correctAnswers = correctAnswers;
    attempt.incorrectAnswers = incorrectAnswers;
    attempt.unanswered = unanswered;
    attempt.passed = attempt.score >= exam.passingMarks;
    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    await attempt.save();

    return res.status(200).json({ success: true, message: 'Exam submitted successfully', data: { attempt } });
  } catch (error) {
    next(error);
  }
};

module.exports = { startAttempt, submitAttempt };