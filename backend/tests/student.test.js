const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const Question = require('../models/Question');
const app = require('../server');

let studentToken;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartexam');
  }

  await User.deleteMany({ email: 'student.phase5@example.com' });
  await Exam.deleteMany({ title: 'Student Dashboard Test Exam' });
  await ExamAttempt.deleteMany({ userId: { $exists: true } });

  const student = await User.create({
    name: 'Student Phase 5',
    email: 'student.phase5@example.com',
    password: 'Password123',
    role: 'student',
  });

  await Exam.create({
    title: 'Student Dashboard Test Exam',
    description: 'Exam used for phase 5 testing',
    subject: 'Science',
    duration: 45,
    totalMarks: 10,
    passingMarks: 5,
    negativeMarking: true,
    negativeMarkValue: 0.25,
    instructions: ['Read carefully'],
    status: 'published',
    createdBy: student._id,
  });

  await ExamAttempt.create({
    userId: student._id,
    examId: (await Exam.findOne({ title: 'Student Dashboard Test Exam' }))._id,
    startedAt: new Date(),
    submittedAt: new Date(),
    status: 'submitted',
    score: 8,
    totalMarks: 10,
    percentage: 80,
    correctAnswers: 8,
    incorrectAnswers: 1,
    unanswered: 1,
    passed: true,
  });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'student.phase5@example.com', password: 'Password123' });

  studentToken = loginRes.headers['set-cookie'][0].split(';')[0].replace('token=', '');
});

describe('Student API', () => {
  it('returns the student dashboard summary and exam list', async () => {
    const res = await request(app)
      .get('/api/users/me/dashboard')
      .set('Cookie', [`token=${studentToken}`]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dashboard).toBeDefined();
    expect(Array.isArray(res.body.data.dashboard.availableExams)).toBe(true);
  });

  it('returns the student attempt history', async () => {
    const res = await request(app)
      .get('/api/users/me/attempts')
      .set('Cookie', [`token=${studentToken}`]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.attempts)).toBe(true);
    expect(res.body.data.attempts.length).toBeGreaterThan(0);
  });

  it('starts and scores an exam on the server', async () => {
    const exam = await Exam.findOne({ title: 'Student Dashboard Test Exam' });
    const question = await Question.create({
      examId: exam._id,
      questionText: 'What is 2 + 2?',
      options: ['3', '4', '5'],
      correctAnswer: 1,
      marks: 2,
      negativeMarks: 0.5,
    });

    const startRes = await request(app)
      .post(`/api/exams/${exam._id}/start`)
      .set('Cookie', [`token=${studentToken}`]);
    const submitRes = await request(app)
      .post(`/api/exams/attempts/${startRes.body.data.attempt._id}/submit`)
      .set('Cookie', [`token=${studentToken}`])
      .send({ answers: { [question._id]: 1 } });

    expect(startRes.statusCode).toBe(201);
    expect(submitRes.statusCode).toBe(200);
    expect(submitRes.body.data.attempt.score).toBe(2);
    expect(submitRes.body.data.attempt.correctAnswers).toBe(1);

    const historyRes = await request(app)
      .get('/api/users/me/attempts')
      .set('Cookie', [`token=${studentToken}`]);
    const detailRes = await request(app)
      .get(`/api/users/me/attempts/${startRes.body.data.attempt._id}`)
      .set('Cookie', [`token=${studentToken}`]);

    expect(historyRes.body.data.attempts.find((item) => item._id === startRes.body.data.attempt._id).answers).toBeUndefined();
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.body.data.attempt.answers).toBeUndefined();
    expect(detailRes.body.data.attempt.review[0]).toMatchObject({
      questionText: 'What is 2 + 2?',
      selectedAnswer: 1,
      correctAnswer: 1,
    });
  });
});

afterAll(async () => {
  await User.deleteMany({ email: 'student.phase5@example.com' });
  await Exam.deleteMany({ title: 'Student Dashboard Test Exam' });
  await Question.deleteMany({ questionText: 'What is 2 + 2?' });
  await ExamAttempt.deleteMany({ userId: { $exists: true } });
  await mongoose.connection.close();
});
