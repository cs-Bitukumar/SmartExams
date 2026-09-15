const mongoose = require('mongoose');

const isValidObjectId = (value) => mongoose.isValidObjectId(value);

// Scores are stored with at most two decimals so fractional negative marking
// (for example 0.25 penalties) cannot accumulate floating point noise such as 4.499999999.
const roundScore = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const toPlainAnswers = (answers) => {
  if (answers instanceof Map) return Object.fromEntries(answers);
  if (answers && typeof answers.toObject === 'function') return answers.toObject();
  return answers && typeof answers === 'object' ? { ...answers } : {};
};

const getExpiry = (attempt, exam) => {
  if (attempt.expiresAt) return new Date(attempt.expiresAt);
  const duration = Number(attempt.durationMinutes || exam?.duration || 0);
  return new Date(new Date(attempt.startedAt).getTime() + (duration * 60 * 1000));
};

const isExpired = (attempt, exam, now = new Date()) => getExpiry(attempt, exam) <= now;

const shuffleList = (items) => {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
};

const getTimeTakenSeconds = (attempt) => {
  if (!attempt || !attempt.startedAt) return 0;
  const startedAt = new Date(attempt.startedAt).getTime();
  const endedAt = attempt.submittedAt ? new Date(attempt.submittedAt).getTime() : Date.now();
  const seconds = Math.round((endedAt - startedAt) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
};

const applyOptionOrder = (question) => {
  const rawOptions = Array.isArray(question.options) ? question.options : [];
  const order = Array.isArray(question.optionOrder) && question.optionOrder.length === rawOptions.length
    ? question.optionOrder.map(Number)
    : rawOptions.map((_, index) => index);
  const options = order.map((rawIndex) => rawOptions[rawIndex]);
  const displayCorrect = order.indexOf(Number(question.correctAnswer));
  return {
    options,
    correctAnswer: displayCorrect >= 0 ? displayCorrect : Number(question.correctAnswer),
  };
};

const toQuestionView = (question) => {
  const ordered = applyOptionOrder(question);
  return {
    questionId: String(question.questionId),
    questionText: question.questionText,
    options: ordered.options,
    correctAnswer: ordered.correctAnswer,
    marks: Number(question.marks) || 0,
    negativeMarks: Number(question.negativeMarks) || 0,
    difficulty: question.difficulty || 'medium',
    type: question.type || 'mcq',
    explanation: question.explanation || '',
  };
};

const getAttemptQuestions = async (attempt, Question) => {
  if (Array.isArray(attempt.questionSnapshot) && attempt.questionSnapshot.length) {
    return attempt.questionSnapshot.map(toQuestionView);
  }

  const questions = await Question.find({ examId: attempt.examId })
    .select('questionText options correctAnswer marks negativeMarks explanation difficulty type')
    .sort({ createdAt: 1 })
    .lean();

  return questions.map((question) => toQuestionView({ ...question, questionId: question._id }));
};

const validateAnswerEntries = (rawAnswers, questions) => {
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
    throw Object.assign(new Error('Answers must be an object keyed by question ID'), { status: 400 });
  }

  const questionById = new Map(questions.map((question) => [question.questionId.toString(), question]));
  const validated = {};

  Object.entries(rawAnswers).forEach(([questionId, rawAnswer]) => {
    if (!isValidObjectId(questionId) || !questionById.has(questionId)) {
      throw Object.assign(new Error('One or more answers do not belong to this attempt'), { status: 400 });
    }

    if (rawAnswer === null || rawAnswer === '') return;

    if (!Number.isInteger(Number(rawAnswer))) {
      throw Object.assign(new Error('Answer selections must be valid option indexes'), { status: 400 });
    }

    const answer = Number(rawAnswer);
    const question = questionById.get(questionId);
    if (answer < 0 || answer >= question.options.length) {
      throw Object.assign(new Error('Answer selection is outside the available options'), { status: 400 });
    }

    validated[questionId] = answer;
  });

  return validated;
};

// An exam can enable negative marking globally while individual questions keep the
// default of zero. In that case the exam-level penalty applies to wrong answers.
const effectiveNegativeMarks = (question, exam) => {
  if (Number(question.negativeMarks) > 0) return Number(question.negativeMarks);
  if (exam && exam.negativeMarking) return Number(exam.negativeMarkValue) || 0;
  return 0;
};

const calculateResult = (attempt, exam, questions) => {
  const answers = toPlainAnswers(attempt.answers);
  let score = 0;
  let correctAnswers = 0;
  let incorrectAnswers = 0;
  let unanswered = 0;

  questions.forEach((question) => {
    const answer = answers[question.questionId.toString()];
    if (answer === undefined || answer === null || answer === '') {
      unanswered += 1;
    } else if (Number(answer) === Number(question.correctAnswer)) {
      correctAnswers += 1;
      score += Number(question.marks) || 0;
    } else {
      incorrectAnswers += 1;
      score -= effectiveNegativeMarks(question, exam);
    }
  });

  const totalMarks = roundScore(questions.reduce((sum, question) => sum + (Number(question.marks) || 0), 0) || exam.totalMarks);
  const finalScore = roundScore(Math.max(0, score));

  return {
    score: finalScore,
    totalMarks,
    percentage: totalMarks ? roundScore((finalScore / totalMarks) * 100) : 0,
    correctAnswers,
    incorrectAnswers,
    unanswered,
    passed: finalScore >= Number(exam.passingMarks || 0),
  };
};

// Shared review builder so every endpoint returns an identical, sanitized shape.
const buildReview = (attempt, questions) => {
  const answers = toPlainAnswers(attempt.answers);
  return questions.map((question) => {
    const rawAnswer = answers[question.questionId.toString()];
    const selectedAnswer = rawAnswer === undefined || rawAnswer === null || rawAnswer === ''
      ? null
      : Number(rawAnswer);
    const outcome = selectedAnswer === null
      ? 'skipped'
      : (selectedAnswer === Number(question.correctAnswer) ? 'correct' : 'incorrect');
    return {
      questionId: question.questionId,
      questionText: question.questionText,
      options: question.options,
      selectedAnswer,
      correctAnswer: question.correctAnswer,
      marks: question.marks,
      negativeMarks: question.negativeMarks,
      difficulty: question.difficulty,
      type: question.type,
      explanation: question.explanation,
      outcome,
    };
  });
};

const sanitizeAttemptForStudent = (attempt, { includeAnswers = false } = {}) => {
  const data = attempt.toObject ? attempt.toObject() : { ...attempt };
  const questions = data.questionSnapshot || [];
  data.questionCount = questions.length || undefined;
  // Backward compatible: attempts created before the manual-review feature
  // have no resultStatus and are treated as already published.
  if (!data.resultStatus) data.resultStatus = 'published';
  delete data.questionSnapshot;
  delete data.integrityEvents;
  if (data.resultStatus === 'pending-review') {
    // Score/result stays hidden until admin publishes it.
    delete data.score;
    delete data.totalMarks;
    delete data.percentage;
    delete data.correctAnswers;
    delete data.incorrectAnswers;
    delete data.unanswered;
    delete data.passed;
  }
  if (!includeAnswers) {
    delete data.answers;
    delete data.markedForReview;
  } else {
    data.answers = toPlainAnswers(data.answers);
    data.markedForReview = toPlainAnswers(data.markedForReview);
  }
  return data;
};

module.exports = {
  buildReview,
  calculateResult,
  effectiveNegativeMarks,
  getAttemptQuestions,
  getExpiry,
  getTimeTakenSeconds,
  isExpired,
  roundScore,
  sanitizeAttemptForStudent,
  shuffleList,
  toPlainAnswers,
  toQuestionView,
  validateAnswerEntries,
};
