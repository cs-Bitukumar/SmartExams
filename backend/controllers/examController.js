const Exam = require('../models/Exam');
const Question = require('../models/Question');
const ExamAttempt = require('../models/ExamAttempt');

const allowedStatuses = new Set(['draft', 'published', 'closed']);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const requiredString = (value, label, maxLength) => {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${label} is required`), { status: 400 });
  if (value.trim().length > maxLength) throw Object.assign(new Error(`${label} is too long`), { status: 400 });
  return value.trim();
};

const validNumber = (value, label, { min = 0, required = false } = {}) => {
  if ((value === undefined || value === null || value === '') && !required) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) throw Object.assign(new Error(`${label} is invalid`), { status: 400 });
  return number;
};

const validDate = (value, label) => {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error(`${label} is invalid`), { status: 400 });
  return date;
};

const parseBoolean = (value, label) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw Object.assign(new Error(`${label} must be true or false`), { status: 400 });
};

const sanitizeExamPayload = (body, { partial = false } = {}) => {
  const payload = {};
  const stringFields = [
    ['title', 'Exam title', 160],
    ['description', 'Exam description', 5000],
    ['subject', 'Subject', 120],
  ];
  stringFields.forEach(([key, label, maxLength]) => {
    if (!partial || hasOwn(body, key)) payload[key] = requiredString(body[key], label, maxLength);
  });

  const numericFields = [
    ['duration', 'Duration', 1],
    ['totalMarks', 'Total marks', 1],
    ['passingMarks', 'Passing marks', 0],
    ['negativeMarkValue', 'Negative mark value', 0],
  ];
  numericFields.forEach(([key, label, min]) => {
    if (!partial || hasOwn(body, key)) payload[key] = validNumber(body[key], label, { min, required: !partial && key !== 'negativeMarkValue' });
  });

  if (!partial || hasOwn(body, 'negativeMarking')) {
    payload.negativeMarking = parseBoolean(body.negativeMarking ?? false, 'Negative marking');
  }
  if (!partial || hasOwn(body, 'attemptLimit')) {
    const attemptLimit = validNumber(body.attemptLimit ?? 0, 'Attempt limit', { min: 0, required: true });
    if (!Number.isInteger(attemptLimit)) throw Object.assign(new Error('Attempt limit must be a whole number'), { status: 400 });
    payload.attemptLimit = attemptLimit;
  }
  if (!partial || hasOwn(body, 'shuffleQuestions')) {
    payload.shuffleQuestions = parseBoolean(body.shuffleQuestions ?? false, 'Shuffle questions');
  }
  if (!partial || hasOwn(body, 'instructions')) {
    if (body.instructions !== undefined && !Array.isArray(body.instructions)) {
      throw Object.assign(new Error('Instructions must be a list'), { status: 400 });
    }
    payload.instructions = (body.instructions || [])
      .filter((item) => typeof item === 'string' && item.trim())
      .map((item) => item.trim().slice(0, 1000));
  }
  if (!partial || hasOwn(body, 'status')) {
    const status = body.status || 'draft';
    if (!allowedStatuses.has(status)) throw Object.assign(new Error('Exam status is invalid'), { status: 400 });
    payload.status = status;
  }
  if (!partial || hasOwn(body, 'startDate')) payload.startDate = validDate(body.startDate, 'Start date');
  if (!partial || hasOwn(body, 'endDate')) payload.endDate = validDate(body.endDate, 'End date');

  const startDate = payload.startDate || (partial ? undefined : null);
  const endDate = payload.endDate || (partial ? undefined : null);
  if (startDate && endDate && endDate <= startDate) {
    throw Object.assign(new Error('End date must be after start date'), { status: 400 });
  }
  if (payload.passingMarks !== undefined && payload.totalMarks !== undefined && payload.passingMarks > payload.totalMarks) {
    throw Object.assign(new Error('Passing marks cannot exceed total marks'), { status: 400 });
  }
  return payload;
};

const sanitizeQuestionPayload = (body, { partial = false } = {}) => {
  const payload = {};
  if (!partial || hasOwn(body, 'questionText')) payload.questionText = requiredString(body.questionText, 'Question text', 5000);
  if (!partial || hasOwn(body, 'options')) {
    if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > 6) {
      throw Object.assign(new Error('Each question needs between 2 and 6 options'), { status: 400 });
    }
    payload.options = body.options.map((option) => requiredString(option, 'Question option', 2000));
  }
  if (!partial || hasOwn(body, 'correctAnswer')) {
    const correctAnswer = validNumber(body.correctAnswer, 'Correct option', { min: 0, required: true });
    if (!Number.isInteger(correctAnswer)) throw Object.assign(new Error('Correct option must be an option index'), { status: 400 });
    payload.correctAnswer = correctAnswer;
  }
  if (!partial || hasOwn(body, 'marks')) payload.marks = validNumber(body.marks ?? 1, 'Marks', { min: 0.01, required: true });
  if (!partial || hasOwn(body, 'negativeMarks')) payload.negativeMarks = validNumber(body.negativeMarks ?? 0, 'Negative marks', { min: 0, required: true });
  if (!partial || hasOwn(body, 'explanation')) {
    if (body.explanation !== undefined && typeof body.explanation !== 'string') throw Object.assign(new Error('Explanation is invalid'), { status: 400 });
    payload.explanation = (body.explanation || '').trim().slice(0, 5000);
  }
  return payload;
};

const verifyQuestionAnswer = (payload, existingQuestion) => {
  const options = payload.options || existingQuestion?.options;
  const correctAnswer = payload.correctAnswer ?? existingQuestion?.correctAnswer;
  if (options && (correctAnswer === undefined || correctAnswer >= options.length)) {
    throw Object.assign(new Error('Correct option must refer to an available option'), { status: 400 });
  }
};

const isExamAvailable = (exam, now = new Date()) => exam.status === 'published'
  && (!exam.startDate || new Date(exam.startDate) <= now)
  && (!exam.endDate || new Date(exam.endDate) >= now);

const getExams = async (req, res, next) => {
  try {
    const now = new Date();
    const filter = req.user.role === 'admin'
      ? {}
      : {
        status: 'published',
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
        ],
      };
    const exams = await Exam.find(filter).sort({ createdAt: -1 }).lean();
    const counts = await Question.aggregate([
      { $match: { examId: { $in: exams.map((exam) => exam._id) } } },
      { $group: { _id: '$examId', count: { $sum: 1 } } },
    ]);
    const countsById = new Map(counts.map((count) => [count._id.toString(), count.count]));
    return res.status(200).json({
      success: true,
      data: { exams: exams.map((exam) => ({ ...exam, questionCount: countsById.get(exam._id.toString()) || 0 })) },
    });
  } catch (error) {
    next(error);
  }
};

const getExamById = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (req.user.role !== 'admin' && !isExamAvailable(exam)) {
      return res.status(403).json({ success: false, message: 'This exam is not currently available' });
    }
    return res.status(200).json({ success: true, data: { exam } });
  } catch (error) {
    next(error);
  }
};

const createExam = async (req, res, next) => {
  try {
    const payload = sanitizeExamPayload(req.body);
    const exam = await Exam.create({ ...payload, createdBy: req.user._id });
    return res.status(201).json({ success: true, message: 'Exam created successfully', data: { exam } });
  } catch (error) {
    next(error);
  }
};

const updateExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    const payload = sanitizeExamPayload(req.body, { partial: true });
    const startDate = payload.startDate !== undefined ? payload.startDate : exam.startDate;
    const endDate = payload.endDate !== undefined ? payload.endDate : exam.endDate;
    if (startDate && endDate && endDate <= startDate) return res.status(400).json({ success: false, message: 'End date must be after start date' });
    const totalMarks = payload.totalMarks ?? exam.totalMarks;
    const passingMarks = payload.passingMarks ?? exam.passingMarks;
    if (passingMarks > totalMarks) return res.status(400).json({ success: false, message: 'Passing marks cannot exceed total marks' });
    Object.assign(exam, payload);
    await exam.save();
    return res.status(200).json({ success: true, message: 'Exam updated successfully', data: { exam } });
  } catch (error) {
    next(error);
  }
};

const deleteExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    const attemptCount = await ExamAttempt.countDocuments({ examId: exam._id });
    if (attemptCount) {
      return res.status(409).json({ success: false, message: 'This exam has attempts and cannot be deleted. Close it instead to preserve results.' });
    }
    await Question.deleteMany({ examId: exam._id });
    await exam.deleteOne();
    return res.status(200).json({ success: true, message: 'Exam deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getQuestionsByExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (req.user.role !== 'admin' && !isExamAvailable(exam)) {
      return res.status(403).json({ success: false, message: 'You cannot view questions for this exam' });
    }
    const questions = await Question.find({ examId: exam._id }).sort({ createdAt: 1 }).lean();
    if (req.user.role === 'admin') return res.status(200).json({ success: true, data: { questions } });
    return res.status(200).json({
      success: true,
      data: {
        questions: questions.map((question) => {
          const safeQuestion = { ...question };
          delete safeQuestion.correctAnswer;
          delete safeQuestion.explanation;
          return safeQuestion;
        }),
      },
    });
  } catch (error) {
    next(error);
  }
};

const createQuestion = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    const payload = sanitizeQuestionPayload(req.body);
    verifyQuestionAnswer(payload);
    const question = await Question.create({ examId: exam._id, ...payload });
    return res.status(201).json({ success: true, message: 'Question created successfully', data: { question } });
  } catch (error) {
    next(error);
  }
};

const updateQuestion = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
    const payload = sanitizeQuestionPayload(req.body, { partial: true });
    verifyQuestionAnswer(payload, question);
    Object.assign(question, payload);
    await question.save();
    return res.status(200).json({ success: true, message: 'Question updated successfully', data: { question } });
  } catch (error) {
    next(error);
  }
};

const deleteQuestion = async (req, res, next) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.id);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
    return res.status(200).json({ success: true, message: 'Question deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createExam,
  createQuestion,
  deleteExam,
  deleteQuestion,
  getExamById,
  getExams,
  getQuestionsByExam,
  updateExam,
  updateQuestion,
};
