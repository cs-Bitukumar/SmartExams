const mongoose = require('mongoose');

const isValidObjectId = (value) => mongoose.isValidObjectId(value);

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

const getAttemptQuestions = async (attempt, Question) => {
  if (Array.isArray(attempt.questionSnapshot) && attempt.questionSnapshot.length) {
    return attempt.questionSnapshot.map((question) => ({
      questionId: question.questionId.toString(),
      questionText: question.questionText,
      options: question.options,
      correctAnswer: question.correctAnswer,
      marks: question.marks,
      negativeMarks: question.negativeMarks || 0,
      explanation: question.explanation || '',
    }));
  }

  const questions = await Question.find({ examId: attempt.examId })
    .select('questionText options correctAnswer marks negativeMarks explanation')
    .sort({ createdAt: 1 })
    .lean();

  return questions.map((question) => ({
    questionId: question._id.toString(),
    questionText: question.questionText,
    options: question.options,
    correctAnswer: question.correctAnswer,
    marks: question.marks,
    negativeMarks: question.negativeMarks || 0,
    explanation: question.explanation || '',
  }));
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
    } else if (Number(answer) === question.correctAnswer) {
      correctAnswers += 1;
      score += question.marks;
    } else {
      incorrectAnswers += 1;
      score -= question.negativeMarks || 0;
    }
  });

  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0) || exam.totalMarks;
  const finalScore = Math.max(0, score);

  return {
    score: finalScore,
    totalMarks,
    percentage: totalMarks ? (finalScore / totalMarks) * 100 : 0,
    correctAnswers,
    incorrectAnswers,
    unanswered,
    passed: finalScore >= exam.passingMarks,
  };
};

const sanitizeAttemptForStudent = (attempt, { includeAnswers = false } = {}) => {
  const data = attempt.toObject ? attempt.toObject() : { ...attempt };
  const questions = data.questionSnapshot || [];
  data.questionCount = questions.length || undefined;
  delete data.questionSnapshot;
  delete data.integrityEvents;
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
  calculateResult,
  getAttemptQuestions,
  getExpiry,
  getTimeTakenSeconds,
  isExpired,
  sanitizeAttemptForStudent,
  shuffleList,
  toPlainAnswers,
  validateAnswerEntries,
};
