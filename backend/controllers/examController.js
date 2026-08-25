const Exam = require('../models/Exam');
const Question = require('../models/Question');

const sanitizeExamPayload = (body) => ({
  title: body.title,
  description: body.description,
  subject: body.subject,
  duration: Number(body.duration),
  totalMarks: Number(body.totalMarks),
  passingMarks: Number(body.passingMarks),
  negativeMarking: Boolean(body.negativeMarking),
  negativeMarkValue: Number(body.negativeMarkValue || 0),
  instructions: Array.isArray(body.instructions)
    ? body.instructions.filter((item) => typeof item === 'string' && item.trim())
    : [],
  status: body.status || 'draft',
  startDate: body.startDate ? new Date(body.startDate) : undefined,
  endDate: body.endDate ? new Date(body.endDate) : undefined,
});

const getExams = async (req, res, next) => {
  try {
    const filter = req.user && req.user.role === 'admin'
      ? {}
      : { status: 'published' };

    const exams = await Exam.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: { exams },
    });
  } catch (error) {
    next(error);
  }
};

const getExamById = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found',
      });
    }

    if (req.user && req.user.role !== 'admin' && exam.status !== 'published') {
      return res.status(403).json({
        success: false,
        message: 'This exam is not available',
      });
    }

    return res.status(200).json({
      success: true,
      data: { exam },
    });
  } catch (error) {
    next(error);
  }
};

const createExam = async (req, res, next) => {
  try {
    const payload = sanitizeExamPayload(req.body);

    const exam = await Exam.create({
      ...payload,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      data: { exam },
    });
  } catch (error) {
    next(error);
  }
};

const updateExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found',
      });
    }

    Object.assign(exam, sanitizeExamPayload(req.body));
    await exam.save();

    return res.status(200).json({
      success: true,
      message: 'Exam updated successfully',
      data: { exam },
    });
  } catch (error) {
    next(error);
  }
};

const deleteExam = async (req, res, next) => {
  try {
    const exam = await Exam.findByIdAndDelete(req.params.id);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found',
      });
    }

    await Question.deleteMany({ examId: exam._id });

    return res.status(200).json({
      success: true,
      message: 'Exam deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

const getQuestionsByExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found',
      });
    }

    if (req.user.role !== 'admin' && exam.status !== 'published') {
      return res.status(403).json({
        success: false,
        message: 'You cannot view questions for this exam',
      });
    }

    const query = Question.find({ examId: req.params.examId }).sort({ createdAt: 1 });
    if (req.user.role !== 'admin') query.select('-correctAnswer -explanation');
    const questions = await query;

    return res.status(200).json({
      success: true,
      data: { questions },
    });
  } catch (error) {
    next(error);
  }
};

const createQuestion = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found',
      });
    }

    const question = await Question.create({
      examId,
      questionText: req.body.questionText,
      options: req.body.options,
      correctAnswer: Number(req.body.correctAnswer),
      marks: Number(req.body.marks || 1),
      negativeMarks: Number(req.body.negativeMarks || 0),
      explanation: req.body.explanation || '',
    });

    return res.status(201).json({
      success: true,
      message: 'Question created successfully',
      data: { question },
    });
  } catch (error) {
    next(error);
  }
};

const updateQuestion = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found',
      });
    }

    Object.assign(question, {
      questionText: req.body.questionText || question.questionText,
      options: req.body.options || question.options,
      correctAnswer: req.body.correctAnswer !== undefined ? Number(req.body.correctAnswer) : question.correctAnswer,
      marks: req.body.marks !== undefined ? Number(req.body.marks) : question.marks,
      negativeMarks: req.body.negativeMarks !== undefined ? Number(req.body.negativeMarks) : question.negativeMarks,
      explanation: req.body.explanation !== undefined ? req.body.explanation : question.explanation,
    });

    await question.save();

    return res.status(200).json({
      success: true,
      message: 'Question updated successfully',
      data: { question },
    });
  } catch (error) {
    next(error);
  }
};

const deleteQuestion = async (req, res, next) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.id);

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Question deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExams,
  getExamById,
  createExam,
  updateExam,
  deleteExam,
  getQuestionsByExam,
  createQuestion,
  updateQuestion,
  deleteQuestion,
};
