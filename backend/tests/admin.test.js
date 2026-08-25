const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const app = require('../server');

let adminToken;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartexam');
  }

  await User.deleteMany({ email: { $in: ['admin@example.com', 'student@example.com'] } });
  await Exam.deleteMany({ title: 'Admin Test Exam' });
  await Question.deleteMany({ questionText: /Admin Test/i });

  await User.create({
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'Password123',
    role: 'admin',
  });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'Password123' });

  adminToken = loginRes.body.data.user ? loginRes.headers['set-cookie'][0].split(';')[0].replace('token=', '') : null;
});

describe('Admin API', () => {
  it('creates an exam as admin', async () => {
    const res = await request(app)
      .post('/api/exams')
      .set('Cookie', [`token=${adminToken}`])
      .send({
        title: 'Admin Test Exam',
        description: 'This exam is for admin testing',
        subject: 'Mathematics',
        duration: 30,
        totalMarks: 10,
        passingMarks: 5,
        negativeMarking: true,
        negativeMarkValue: 0.25,
        instructions: ['Read carefully', 'No cheating'],
        status: 'published',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.exam.title).toBe('Admin Test Exam');
  });

  it('adds a question to the exam', async () => {
    const exam = await Exam.findOne({ title: 'Admin Test Exam' });

    const res = await request(app)
      .post(`/api/exams/${exam._id}/questions`)
      .set('Cookie', [`token=${adminToken}`])
      .send({
        questionText: 'Admin Test Question 1',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 1,
        marks: 2,
        negativeMarks: 0.5,
        explanation: 'Because B is correct.'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.question.questionText).toBe('Admin Test Question 1');
  });

  it('lists admin users and toggles user status safely', async () => {
    const student = await User.create({
      name: 'Student User',
      email: 'student@example.com',
      password: 'Password123',
      role: 'student',
    });

    const usersRes = await request(app)
      .get('/api/admin/users')
      .set('Cookie', [`token=${adminToken}`]);

    expect(usersRes.statusCode).toBe(200);
    expect(usersRes.body.success).toBe(true);

    const toggleRes = await request(app)
      .patch(`/api/admin/users/${student._id}/toggle-status`)
      .set('Cookie', [`token=${adminToken}`])
      .send({ isActive: false });

    expect(toggleRes.statusCode).toBe(200);
    expect(toggleRes.body.success).toBe(true);
    expect(toggleRes.body.data.user.isActive).toBe(false);
  });
});

afterAll(async () => {
  await User.deleteMany({ email: { $in: ['admin@example.com', 'student@example.com'] } });
  await Exam.deleteMany({ title: 'Admin Test Exam' });
  await Question.deleteMany({ questionText: /Admin Test/i });
  await mongoose.connection.close();
});
