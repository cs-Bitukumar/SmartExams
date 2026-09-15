const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const Question = require('../models/Question');
const app = require('../server');

const STUDENT_EMAIL = 'engine.student@example.com';
const EXAM_TITLE = 'Engine Test Exam';
const LIMITED_TITLE = 'Engine Limited Exam';

let studentToken;
let student;
let exam;
let limitedExam;
let questionOne;
let questionTwo;
let attemptId;

const loginToken = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123' });
  return res.headers['set-cookie'][0].split(';')[0].replace('token=', '');
};

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartexam');
  }
  await User.deleteMany({ email: STUDENT_EMAIL });
  await Exam.deleteMany({ title: { $in: [EXAM_TITLE, LIMITED_TITLE] } });

  student = await User.create({ name: 'Engine Student', email: STUDENT_EMAIL, password: 'Password123', role: 'student' });

  exam = await Exam.create({
    title: EXAM_TITLE,
    description: 'Exam used to verify the attempt engine',
    subject: 'Physics',
    duration: 30,
    totalMarks: 5,
    passingMarks: 3,
    negativeMarking: true,
    negativeMarkValue: 0.5,
    status: 'published',
    createdBy: student._id,
  });

  limitedExam = await Exam.create({
    title: LIMITED_TITLE,
    description: 'Exam used to verify attempt limits',
    subject: 'Chemistry',
    duration: 20,
    totalMarks: 1,
    passingMarks: 1,
    attemptLimit: 1,
    status: 'published',
    createdBy: student._id,
  });

  questionOne = await Question.create({
    examId: exam._id,
    questionText: 'Engine Test Q1',
    options: ['A', 'B', 'C'],
    correctAnswer: 1,
    marks: 2,
    negativeMarks: 0.5,
    explanation: 'B is correct.',
  });
  questionTwo = await Question.create({
    examId: exam._id,
    questionText: 'Engine Test Q2',
    options: ['A', 'B'],
    correctAnswer: 0,
    marks: 3,
    negativeMarks: 0.5,
  });
  await Question.create({
    examId: limitedExam._id,
    questionText: 'Engine Limited Q1',
    options: ['Yes', 'No'],
    correctAnswer: 0,
    marks: 1,
  });

  studentToken = await loginToken(STUDENT_EMAIL);
});

afterAll(async () => {
  const examIds = [exam._id, limitedExam._id];
  await ExamAttempt.deleteMany({ examId: { $in: examIds } });
  await Question.deleteMany({ examId: { $in: examIds } });
  await Exam.deleteMany({ _id: { $in: examIds } });
  await User.deleteMany({ email: STUDENT_EMAIL });
  await mongoose.connection.close();
});

describe('Exam engine', () => {
  it('starts an attempt with server-owned timing and a question snapshot', async () => {
    const res = await request(app)
      .post(`/api/exams/${exam._id}/start`)
      .set('Cookie', [`token=${studentToken}`]);

    expect(res.statusCode).toBe(201);
    expect(res.body.data.attempt.status).toBe('in-progress');
    expect(res.body.data.attempt.expiresAt).toBeTruthy();
    expect(res.body.data.attempt.questionCount).toBe(2);
    expect(res.body.data.attempt.questionSnapshot).toBeUndefined();
    expect(res.body.data.timeRemainingSeconds).toBeGreaterThan(0);
    expect(res.body.data.attemptsRemaining).toBeNull();
    attemptId = res.body.data.attempt._id;
  });

  it('resumes the same attempt after a browser refresh', async () => {
    const res = await request(app)
      .post(`/api/exams/${exam._id}/start`)
      .set('Cookie', [`token=${studentToken}`]);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.resumed).toBe(true);
    expect(res.body.data.attempt._id).toBe(attemptId);
  });

  it('serves questions without leaking answers before submission', async () => {
    const res = await request(app)
      .get(`/api/exams/attempts/${attemptId}`)
      .set('Cookie', [`token=${studentToken}`]);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.questions).toHaveLength(2);
    res.body.data.questions.forEach((question) => {
      expect(question.correctAnswer).toBeUndefined();
      expect(question.explanation).toBeUndefined();
    });
    expect(res.body.data.timeRemainingSeconds).toBeGreaterThan(0);
  });

  it('saves, updates and clears answers', async () => {
    const saved = await request(app)
      .put(`/api/exams/attempts/${attemptId}/answers`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ questionId: questionOne._id.toString(), selectedAnswer: 1 });
    expect(saved.statusCode).toBe(200);
    expect(saved.body.data.savedAnswer).toBe(1);

    const updated = await request(app)
      .put(`/api/exams/attempts/${attemptId}/answers`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ questionId: questionOne._id.toString(), selectedAnswer: 0 });
    expect(updated.body.data.savedAnswer).toBe(0);

    const cleared = await request(app)
      .put(`/api/exams/attempts/${attemptId}/answers`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ questionId: questionOne._id.toString(), selectedAnswer: null });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.body.data.cleared).toBe(true);
    expect(cleared.body.data.savedAnswer).toBeNull();
  });

  it('rejects answers that are out of range or from another exam', async () => {
    const outOfRange = await request(app)
      .put(`/api/exams/attempts/${attemptId}/answers`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ questionId: questionOne._id.toString(), selectedAnswer: 99 });
    expect(outOfRange.statusCode).toBe(400);

    const foreign = await request(app)
      .put(`/api/exams/attempts/${attemptId}/answers`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ questionId: new mongoose.Types.ObjectId().toString(), selectedAnswer: 0 });
    expect(foreign.statusCode).toBe(400);
  });

  it('marks questions for review and records integrity signals', async () => {
    const review = await request(app)
      .put(`/api/exams/attempts/${attemptId}/answers`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ questionId: questionOne._id.toString(), markedForReview: true });
    expect(review.statusCode).toBe(200);
    expect(review.body.data.markedForReview[questionOne._id.toString()]).toBe(true);

    const violation = await request(app)
      .post(`/api/exams/attempts/${attemptId}/violations`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ type: 'visibility-hidden' });
    expect(violation.statusCode).toBe(200);
    expect(violation.body.data.violations).toBe(1);

    const coerced = await request(app)
      .post(`/api/exams/attempts/${attemptId}/violations`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ type: 'not-a-real-type' });
    expect(coerced.body.data.violations).toBe(2);
  });

  it('scores on the server and ignores client-supplied scores', async () => {
    await request(app)
      .put(`/api/exams/attempts/${attemptId}/answers`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ questionId: questionOne._id.toString(), selectedAnswer: 1 });

    const res = await request(app)
      .post(`/api/exams/attempts/${attemptId}/submit`)
      .set('Cookie', [`token=${studentToken}`])
      .send({
        answers: { [questionTwo._id.toString()]: 0 },
        score: 9999,
        percentage: 100,
        passed: true,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.attempt.score).toBe(5);
    expect(res.body.data.attempt.percentage).toBe(100);
    expect(res.body.data.attempt.correctAnswers).toBe(2);
    expect(res.body.data.attempt.passed).toBe(true);
  });

  it('rejects a duplicate submission and further answers', async () => {
    const duplicate = await request(app)
      .post(`/api/exams/attempts/${attemptId}/submit`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ answers: {} });
    expect(duplicate.statusCode).toBe(409);

    const late = await request(app)
      .put(`/api/exams/attempts/${attemptId}/answers`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ questionId: questionOne._id.toString(), selectedAnswer: 1 });
    expect(late.statusCode).toBe(409);
  });

  it('returns a sanitized review with outcomes to the owner', async () => {
    const res = await request(app)
      .get(`/api/users/me/attempts/${attemptId}`)
      .set('Cookie', [`token=${studentToken}`]);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.attempt.answers).toBeUndefined();
    expect(res.body.data.attempt.timeTakenSeconds).toBeGreaterThanOrEqual(0);
    expect(res.body.data.attempt.review).toHaveLength(2);
    expect(res.body.data.attempt.review[0]).toMatchObject({ selectedAnswer: 1, correctAnswer: 1, outcome: 'correct' });
  });

  it('auto-submits an expired attempt and refuses later answers', async () => {
    const expired = await ExamAttempt.create({
      userId: student._id,
      examId: exam._id,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 30 * 60 * 1000),
      durationMinutes: 30,
      questionSnapshot: [{
        questionId: questionOne._id,
        questionText: questionOne.questionText,
        options: questionOne.options,
        correctAnswer: questionOne.correctAnswer,
        marks: questionOne.marks,
        negativeMarks: questionOne.negativeMarks,
        explanation: '',
      }],
    });

    const state = await request(app)
      .get(`/api/exams/attempts/${expired._id}`)
      .set('Cookie', [`token=${studentToken}`]);

    expect(state.statusCode).toBe(200);
    expect(state.body.data.autoSubmitted).toBe(true);
    expect(state.body.data.attempt.status).toBe('auto-submitted');
    expect(state.body.data.timeRemainingSeconds).toBe(0);

    const late = await request(app)
      .put(`/api/exams/attempts/${expired._id}/answers`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ questionId: questionOne._id.toString(), selectedAnswer: 1 });
    expect(late.statusCode).toBe(409);
  });

  it('enforces the per-exam attempt limit', async () => {
    const first = await request(app)
      .post(`/api/exams/${limitedExam._id}/start`)
      .set('Cookie', [`token=${studentToken}`]);
    expect(first.statusCode).toBe(201);

    await request(app)
      .post(`/api/exams/attempts/${first.body.data.attempt._id}/submit`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ answers: {} });

    const blocked = await request(app)
      .post(`/api/exams/${limitedExam._id}/start`)
      .set('Cookie', [`token=${studentToken}`]);

    expect(blocked.statusCode).toBe(409);
    expect(blocked.body.data.attemptsRemaining).toBe(0);
  });
});