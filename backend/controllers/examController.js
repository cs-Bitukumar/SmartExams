const Exam = require('../models/Exam');
const Question = require('../models/Question');
const ExamAttempt = require('../models/ExamAttempt');

const allowedStatuses = new Set(['draft', 'published', 'closed']);
const allowedSortFields = new Set(['createdAt', 'title', 'subject', 'duration', 'totalMarks', 'startDate', 'endDate']);
const allowedDifficulties = new Set(['easy', 'medium', 'hard']);
const allowedTypes = new Set(['mcq', 'true-false']);
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
  if (!partial || hasOwn(body, 'requireAdminReview')) {
    payload.requireAdminReview = parseBoolean(body.requireAdminReview ?? false, 'Require admin review');
  }
  if (!partial || hasOwn(body, 'shuffleQuestions')) {
    payload.shuffleQuestions = parseBoolean(body.shuffleQuestions ?? false, 'Shuffle questions');
  }
  if (!partial || hasOwn(body, 'shuffleOptions')) {
    payload.shuffleOptions = parseBoolean(body.shuffleOptions ?? false, 'Shuffle options');
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
    const correctAnswer = validNumber(body.correctAnswer, 'Correct option', { min: 0, required: !partial });
    if (correctAnswer !== undefined) {
      if (!Number.isInteger(correctAnswer)) throw Object.assign(new Error('Correct option must be an option index'), { status: 400 });
      payload.correctAnswer = correctAnswer;
    }
  }
  if (!partial || hasOwn(body, 'marks')) payload.marks = validNumber(body.marks ?? 1, 'Marks', { min: 0.01, required: true });
  if (!partial || hasOwn(body, 'negativeMarks')) payload.negativeMarks = validNumber(body.negativeMarks ?? 0, 'Negative marks', { min: 0, required: true });
  if (!partial || hasOwn(body, 'explanation')) {
    if (body.explanation !== undefined && typeof body.explanation !== 'string') throw Object.assign(new Error('Explanation is invalid'), { status: 400 });
    payload.explanation = (body.explanation || '').trim().slice(0, 5000);
  }
  if (!partial || hasOwn(body, 'difficulty')) {
    const difficulty = body.difficulty ?? 'medium';
    if (!allowedDifficulties.has(difficulty)) throw Object.assign(new Error('Difficulty is invalid'), { status: 400 });
    payload.difficulty = difficulty;
  }
  if (!partial || hasOwn(body, 'type')) {
    const type = body.type ?? 'mcq';
    if (!allowedTypes.has(type)) throw Object.assign(new Error('Question type is invalid'), { status: 400 });
    payload.type = type;
  }
  return payload;
};

const normalizeQuestionType = (payload, existingQuestion) => {
  const type = payload.type || existingQuestion?.type || 'mcq';
  if (type !== 'true-false') return payload;
  // True/false questions use the canonical True/False pair so the
  // correct-answer index stays stable for display, scoring and review.
  const normalized = { ...payload, type, options: ['True', 'False'] };
  const candidate = payload.correctAnswer !== undefined ? Number(payload.correctAnswer) : existingQuestion?.correctAnswer;
  normalized.correctAnswer = candidate === 1 ? 1 : 0;
  return normalized;
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

// Derived, display-only state computed from status + schedule window. The stored
// enum intentionally stays draft/published/closed so scheduling is backwards compatible.
const describeExamState = (exam, now = new Date()) => {
  if (!exam) return 'unknown';
  if (exam.status === 'draft') return 'draft';
  if (exam.status === 'closed') return 'closed';
  if (exam.startDate && new Date(exam.startDate) > now) return 'scheduled';
  if (exam.endDate && new Date(exam.endDate) < now) return 'expired';
  return 'active';
};

const withExamMeta = (exam, extra = {}) => {
  const plain = typeof exam.toObject === 'function' ? exam.toObject() : { ...exam };
  const totalMarks = Number(plain.totalMarks) || 0;
  const passingMarks = Number(plain.passingMarks) || 0;
  return {
    ...plain,
    state: describeExamState(plain),
    passingPercentage: totalMarks > 0 ? Math.round((passingMarks / totalMarks) * 10000) / 100 : 0,
    ...extra,
  };
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseSortOption = (value) => {
  if (typeof value !== 'string' || !value) return { createdAt: -1 };
  const direction = value.startsWith('-') ? -1 : 1;
  const field = value.startsWith('-') ? value.slice(1) : value;
  if (!allowedSortFields.has(field)) return { createdAt: -1 };
  return { [field]: direction };
};

const getExams = async (req, res, next) => {
  try {
    const now = new Date();
    const filter = req.user.role === 'admin' ? {} : { status: 'published' };
    const query = req.query || {};
    if (typeof query.search === 'string' && query.search.trim()) {
      const safe = escapeRegex(query.search.trim());
      filter.$or = [
        { title: { $regex: safe, $options: 'i' } },
        { subject: { $regex: safe, $options: 'i' } },
        { description: { $regex: safe, $options: 'i' } },
      ];
    }
    if (typeof query.subject === 'string' && query.subject.trim()) {
      filter.subject = { $regex: `^${escapeRegex(query.subject.trim())}$`, $options: 'i' };
    }
    if (req.user.role === 'admin' && typeof query.status === 'string' && allowedStatuses.has(query.status)) {
      filter.status = query.status;
    }
    if (req.user.role !== 'admin') {
      filter.$and = [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ];
    }
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 50));
    const sortOption = parseSortOption(query.sort);
    const [exams, total] = await Promise.all([
      Exam.find(filter).sort(sortOption).skip((page - 1) * limit).limit(limit).lean(),
      Exam.countDocuments(filter),
    ]);
    const counts = await Question.aggregate([
      { $match: { examId: { $in: exams.map((exam) => exam._id) } } },
      { $group: { _id: '$examId', count: { $sum: 1 } } },
    ]);
    const countsById = new Map(counts.map((count) => [count._id.toString(), count.count]));
    return res.status(200).json({
      success: true,
      data: {
        exams: exams.map((exam) => withExamMeta(exam, { questionCount: countsById.get(exam._id.toString()) || 0 })),
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      },
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
    const questionCount = await Question.countDocuments({ examId: exam._id });
    return res.status(200).json({ success: true, data: { exam: withExamMeta(exam, { questionCount }) } });
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

// Publishing a draft makes it visible to students. Blocked until the exam has
// at least one question so students never see an empty paper.
const publishExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (exam.status === 'published') {
      return res.status(409).json({ success: false, message: 'This exam is already published' });
    }
    const questionCount = await Question.countDocuments({ examId: exam._id });
    if (!questionCount) {
      return res.status(409).json({ success: false, message: 'Add at least one question before publishing this exam' });
    }
    exam.status = 'published';
    await exam.save();
    return res.status(200).json({
      success: true,
      message: 'Exam published. Students can now attempt it.',
      data: { exam: withExamMeta(exam) },
    });
  } catch (error) {
    next(error);
  }
};

// Duplicates an exam with its questions (without attempts/results) as a draft
// so admins can safely reuse exam structure for a new term or subject group.
const duplicateExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id).lean();
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    const copy = await Exam.create({
      title: `Copy of ${exam.title}`.slice(0, 160),
      description: exam.description,
      subject: exam.subject,
      duration: exam.duration,
      totalMarks: exam.totalMarks,
      passingMarks: exam.passingMarks,
      negativeMarking: exam.negativeMarking,
      negativeMarkValue: exam.negativeMarkValue,
      attemptLimit: exam.attemptLimit,
      shuffleQuestions: exam.shuffleQuestions,
      shuffleOptions: exam.shuffleOptions || false,
      instructions: exam.instructions || [],
      status: 'draft',
      createdBy: req.user._id,
    });
    const questions = await Question.find({ examId: exam._id }).lean();
    if (questions.length) {
      await Question.insertMany(questions.map((question) => ({
        examId: copy._id,
        questionText: question.questionText,
        options: question.options,
        correctAnswer: question.correctAnswer,
        marks: question.marks,
        negativeMarks: question.negativeMarks || 0,
        explanation: question.explanation || '',
        difficulty: question.difficulty || 'medium',
        type: question.type || 'mcq',
      })));
    }
    return res.status(201).json({
      success: true,
      message: 'Exam duplicated as a draft',
      data: { exam: withExamMeta(copy, { questionCount: questions.length }) },
    });
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
    const query = req.query || {};
    const filter = { examId: exam._id };
    if (typeof query.difficulty === 'string' && allowedDifficulties.has(query.difficulty)) {
      filter.difficulty = query.difficulty;
    }
    if (typeof query.type === 'string' && allowedTypes.has(query.type)) {
      filter.type = query.type;
    }
    if (typeof query.search === 'string' && query.search.trim()) {
      filter.questionText = { $regex: escapeRegex(query.search.trim()), $options: 'i' };
    }
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 50));
    const [questions, total] = await Promise.all([
      Question.find(filter).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Question.countDocuments(filter),
    ]);
    if (req.user.role === 'admin') {
      return res.status(200).json({
        success: true,
        data: { questions, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } },
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        questions: questions.map((question) => {
          const safeQuestion = { ...question };
          delete safeQuestion.correctAnswer;
          delete safeQuestion.explanation;
          return safeQuestion;
        }),
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
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
    const payload = normalizeQuestionType(sanitizeQuestionPayload(req.body), null);
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
    const payload = normalizeQuestionType(sanitizeQuestionPayload(req.body, { partial: true }), question);
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
  describeExamState,
  duplicateExam,
  getExamById,
  getExams,
  getQuestionsByExam,
  publishExam,
  updateExam,
  updateQuestion,
  withExamMeta,
};
