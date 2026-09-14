const Exam = require('../models/Exam');
const Question = require('../models/Question');
const ExamAttempt = require('../models/ExamAttempt');
const {
  calculateResult,
  getAttemptQuestions,
  getExpiry,
  isExpired,
  sanitizeAttemptForStudent,
  shuffleList,
  toPlainAnswers,
  validateAnswerEntries,
} = require('../services/attemptService');

const completedStatuses = ['submitted', 'auto-submitted'];
const countUsedAttempts = (userId, examId) => ExamAttempt.countDocuments({
  userId,
  examId,
  status: { $in: completedStatuses },
});
const attemptsLeft = (exam, used) => (exam.attemptLimit > 0 ? Math.max(0, exam.attemptLimit - used) : null);
const timeRemainingSeconds = (attempt, exam) => Math.max(
  0,
  Math.round((getExpiry(attempt, exam).getTime() - Date.now()) / 1000),
);

const isExamOpen = (exam, now = new Date()) => {
  if (exam.status !== 'published') return false;
  if (exam.startDate && new Date(exam.startDate) > now) return false;
  return !(exam.endDate && new Date(exam.endDate) < now);
};

const finalizeAttempt = async (attempt, exam, status = 'submitted') => {
  const questions = await getAttemptQuestions(attempt, Question);
  const result = calculateResult(attempt, exam, questions);
  return ExamAttempt.findOneAndUpdate(
    { _id: attempt._id, userId: attempt.userId, status: 'in-progress' },
    { $set: { ...result, status, submittedAt: new Date() } },
    { returnDocument: 'after', runValidators: true },
  );
};

const autoFinalizeIfExpired = async (attempt, exam) => {
  if (attempt.status !== 'in-progress' || !isExpired(attempt, exam)) return attempt;
  return (await finalizeAttempt(attempt, exam, 'auto-submitted')) || attempt;
};

const startAttempt = async (req, res, next) => {
  try {
    const now = new Date();
    const exam = await Exam.findById(req.params.examId);
    if (!exam || !isExamOpen(exam, now)) {
      return res.status(404).json({ success: false, message: 'This exam is not currently available' });
    }

    const existingAttempt = await ExamAttempt.findOne({
      userId: req.user._id,
      examId: exam._id,
      status: 'in-progress',
    });
    if (existingAttempt && !isExpired(existingAttempt, exam, now)) {
      const used = await countUsedAttempts(req.user._id, exam._id);
      return res.status(200).json({
        success: true,
        data: {
          attempt: sanitizeAttemptForStudent(existingAttempt, { includeAnswers: true }),
          exam,
          serverTime: now.toISOString(),
          timeRemainingSeconds: timeRemainingSeconds(existingAttempt, exam),
          attemptsUsed: used,
          attemptsRemaining: attemptsLeft(exam, used),
          resumed: true,
        },
      });
    }
    if (existingAttempt) await autoFinalizeIfExpired(existingAttempt, exam);

    const attemptsUsed = await countUsedAttempts(req.user._id, exam._id);
    if (exam.attemptLimit > 0 && attemptsUsed >= exam.attemptLimit) {
      return res.status(409).json({
        success: false,
        message: `You have used all ${exam.attemptLimit} attempt(s) allowed for this exam`,
        data: { attemptsUsed, attemptsRemaining: 0 },
      });
    }

    const questions = await Question.find({ examId: exam._id })
      .select('questionText options correctAnswer marks negativeMarks explanation')
      .sort({ createdAt: 1 })
      .lean();
    if (!questions.length) {
      return res.status(409).json({ success: false, message: 'This exam has no questions yet' });
    }

    const orderedQuestions = exam.shuffleQuestions ? shuffleList(questions) : questions;
    const expiresAt = new Date(now.getTime() + (exam.duration * 60 * 1000));
    const attempt = await ExamAttempt.create({
      userId: req.user._id,
      examId: exam._id,
      startedAt: now,
      expiresAt,
      durationMinutes: exam.duration,
      totalMarks: orderedQuestions.reduce((sum, question) => sum + question.marks, 0) || exam.totalMarks,
      questionSnapshot: orderedQuestions.map((question) => ({
        questionId: question._id,
        questionText: question.questionText,
        options: question.options,
        correctAnswer: question.correctAnswer,
        marks: question.marks,
        negativeMarks: question.negativeMarks || 0,
        explanation: question.explanation || '',
      })),
    });
    return res.status(201).json({
      success: true,
      data: {
        attempt: sanitizeAttemptForStudent(attempt, { includeAnswers: true }),
        exam,
        serverTime: now.toISOString(),
        timeRemainingSeconds: timeRemainingSeconds(attempt, exam),
        attemptsUsed,
        attemptsRemaining: attemptsLeft(exam, attemptsUsed),
        resumed: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getAttemptState = async (req, res, next) => {
  try {
    let attempt = await ExamAttempt.findOne({ _id: req.params.attemptId, userId: req.user._id });
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });

    const exam = await Exam.findById(attempt.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const wasInProgress = attempt.status === 'in-progress';
    attempt = await autoFinalizeIfExpired(attempt, exam);
    const data = {
      attempt: sanitizeAttemptForStudent(attempt, { includeAnswers: attempt.status === 'in-progress' }),
      exam,
      serverTime: new Date().toISOString(),
      timeRemainingSeconds: attempt.status === 'in-progress' ? timeRemainingSeconds(attempt, exam) : 0,
      autoSubmitted: wasInProgress && attempt.status === 'auto-submitted',
    };
    if (attempt.status === 'in-progress') {
      const questions = await getAttemptQuestions(attempt, Question);
      data.questions = questions.map((question) => {
        const safeQuestion = { ...question };
        delete safeQuestion.correctAnswer;
        delete safeQuestion.explanation;
        return safeQuestion;
      });
    }
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const saveAnswer = async (req, res, next) => {
  try {
    let attempt = await ExamAttempt.findOne({ _id: req.params.attemptId, userId: req.user._id });
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
    const exam = await Exam.findById(attempt.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    if (attempt.status !== 'in-progress') {
      return res.status(409).json({ success: false, message: 'This attempt has already been submitted' });
    }
    if (isExpired(attempt, exam)) {
      attempt = await autoFinalizeIfExpired(attempt, exam);
      return res.status(409).json({
        success: false,
        message: 'Time has expired and your exam was submitted automatically',
        data: { attempt: sanitizeAttemptForStudent(attempt) },
      });
    }

    const questions = await getAttemptQuestions(attempt, Question);
    const question = questions.find((item) => item.questionId.toString() === String(req.body.questionId));
    if (!question) return res.status(400).json({ success: false, message: 'This question does not belong to the attempt' });
    if (req.body.selectedAnswer === undefined && req.body.markedForReview === undefined) {
      return res.status(400).json({ success: false, message: 'An answer or review status is required' });
    }
    if (req.body.markedForReview !== undefined && typeof req.body.markedForReview !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Review status must be true or false' });
    }
    // selectedAnswer: null clears a previously saved answer (used by "Clear response").
    const isClearing = req.body.selectedAnswer === null;
    const answer = req.body.selectedAnswer === undefined || isClearing
      ? {}
      : validateAnswerEntries({ [req.body.questionId]: req.body.selectedAnswer }, questions);
    const answers = { ...toPlainAnswers(attempt.answers), ...answer };
    if (isClearing) delete answers[String(req.body.questionId)];
    const markedForReview = {
      ...toPlainAnswers(attempt.markedForReview),
      ...(req.body.markedForReview === undefined ? {} : { [req.body.questionId]: req.body.markedForReview }),
    };
    const updated = await ExamAttempt.findOneAndUpdate(
      { _id: attempt._id, userId: req.user._id, status: 'in-progress' },
      { $set: { answers, markedForReview } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!updated) return res.status(409).json({ success: false, message: 'This attempt is no longer active' });
    return res.status(200).json({
      success: true,
      message: isClearing ? 'Answer cleared' : 'Answer saved',
      data: {
        questionId: String(req.body.questionId),
        savedAnswer: answers[String(req.body.questionId)] ?? null,
        cleared: isClearing,
        markedForReview,
        savedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

const submitAttempt = async (req, res, next) => {
  try {
    const attempt = await ExamAttempt.findOne({ _id: req.params.attemptId, userId: req.user._id });
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
    const exam = await Exam.findById(attempt.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (attempt.status !== 'in-progress') {
      return res.status(409).json({ success: false, message: 'Attempt has already been submitted' });
    }

    const expired = isExpired(attempt, exam);
    const questions = await getAttemptQuestions(attempt, Question);
    if (!expired && req.body.answers !== undefined) {
      const submittedAnswers = validateAnswerEntries(req.body.answers, questions);
      attempt.answers = { ...toPlainAnswers(attempt.answers), ...submittedAnswers };
    }

    const result = calculateResult(attempt, exam, questions);
    const submitted = await ExamAttempt.findOneAndUpdate(
      { _id: attempt._id, userId: req.user._id, status: 'in-progress' },
      {
        $set: {
          ...result,
          answers: toPlainAnswers(attempt.answers),
          status: expired ? 'auto-submitted' : 'submitted',
          submittedAt: new Date(),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!submitted) return res.status(409).json({ success: false, message: 'Attempt has already been submitted' });

    return res.status(200).json({
      success: true,
      message: expired ? 'Time expired and the exam was submitted automatically' : 'Exam submitted successfully',
      data: { attempt: sanitizeAttemptForStudent(submitted), autoSubmitted: expired },
    });
  } catch (error) {
    next(error);
  }
};

// Lightweight browser-level integrity signal. The server still owns timing and scoring,
// so these events are advisory only and are capped to avoid unbounded document growth.
const reportViolation = async (req, res, next) => {
  try {
    const attempt = await ExamAttempt.findOne({ _id: req.params.attemptId, userId: req.user._id });
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
    if (attempt.status !== 'in-progress') {
      return res.status(409).json({ success: false, message: 'This attempt is no longer active' });
    }

    const allowedTypes = new Set(['visibility-hidden', 'window-blur', 'fullscreen-exit', 'copy', 'paste', 'other']);
    const requestedType = typeof req.body?.type === 'string' ? req.body.type.trim() : '';
    const eventType = allowedTypes.has(requestedType) ? requestedType : 'other';

    const updated = await ExamAttempt.findOneAndUpdate(
      { _id: attempt._id, userId: req.user._id, status: 'in-progress' },
      {
        $inc: { violations: 1 },
        $push: { integrityEvents: { $each: [{ type: eventType, at: new Date() }], $slice: -50 } },
      },
      { returnDocument: 'after' },
    );
    if (!updated) return res.status(409).json({ success: false, message: 'This attempt is no longer active' });

    return res.status(200).json({
      success: true,
      message: 'Activity recorded',
      data: { violations: updated.violations, recordedAt: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAttemptState, reportViolation, saveAnswer, startAttempt, submitAttempt };
