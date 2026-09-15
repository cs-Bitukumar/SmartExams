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
  await Exam.deleteMany({ title: 'Admin Draft Exam' });
  await Question.deleteMany({ questionText: /Admin Test/i });
  await Question.deleteMany({ questionText: /Admin Draft/i });

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

    const examsRes = await request(app)
      .get('/api/exams')
      .set('Cookie', [`token=${adminToken}`]);

    expect(examsRes.body.data.exams[0].questionCount).toBe(0);
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

    const examsRes = await request(app)
      .get('/api/exams')
      .set('Cookie', [`token=${adminToken}`]);

    expect(examsRes.body.data.exams[0].questionCount).toBe(1);
  });

  it('lets admins edit a draft and publish it only with questions', async () => {
    const createRes = await request(app)
      .post('/api/exams')
      .set('Cookie', [`token=${adminToken}`])
      .send({
        title: 'Admin Draft Exam',
        description: 'Draft edit and publish flow',
        subject: 'Science',
        duration: 20,
        totalMarks: 5,
        passingMarks: 2,
        instructions: [],
        status: 'draft',
      });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.data.exam.status).toBe('draft');
    const examId = createRes.body.data.exam._id;

    // Drafts stay hidden from students but are visible to the admin list.
    const adminListRes = await request(app).get('/api/exams').set('Cookie', [`token=${adminToken}`]);
    const draft = adminListRes.body.data.exams.find((exam) => exam._id === examId);
    expect(draft).toBeDefined();
    expect(draft.status).toBe('draft');

    // Publishing without questions is blocked so students never see an empty paper.
    const blockedRes = await request(app)
      .post(`/api/exams/${examId}/publish`)
      .set('Cookie', [`token=${adminToken}`]);
    expect(blockedRes.statusCode).toBe(409);
    expect(blockedRes.body.success).toBe(false);

    // Admin can edit the draft while it stays unpublished.
    const updateRes = await request(app)
      .put(`/api/exams/${examId}`)
      .set('Cookie', [`token=${adminToken}`])
      .send({ title: 'Admin Draft Exam', description: 'Updated draft description', duration: 25 });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.data.exam.duration).toBe(25);
    expect(updateRes.body.data.exam.description).toBe('Updated draft description');
    expect(updateRes.body.data.exam.status).toBe('draft');

    // After adding a question the publish succeeds.
    const questionRes = await request(app)
      .post(`/api/exams/${examId}/questions`)
      .set('Cookie', [`token=${adminToken}`])
      .send({
        questionText: 'Admin Draft Question 1',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 0,
        marks: 5,
      });
    expect(questionRes.statusCode).toBe(201);

    const publishRes = await request(app)
      .post(`/api/exams/${examId}/publish`)
      .set('Cookie', [`token=${adminToken}`]);
    expect(publishRes.statusCode).toBe(200);
    expect(publishRes.body.success).toBe(true);
    expect(publishRes.body.data.exam.status).toBe('published');

    // Publishing again is rejected.
    const repeatRes = await request(app)
      .post(`/api/exams/${examId}/publish`)
      .set('Cookie', [`token=${adminToken}`]);
    expect(repeatRes.statusCode).toBe(409);

    // Unpublish moves the exam back to draft.
    const unpublishRes = await request(app)
      .put(`/api/exams/${examId}`)
      .set('Cookie', [`token=${adminToken}`])
      .send({ status: 'draft' });
    expect(unpublishRes.statusCode).toBe(200);
    expect(unpublishRes.body.data.exam.status).toBe('draft');
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
  await Exam.deleteMany({ title: 'Admin Draft Exam' });
  await Question.deleteMany({ questionText: /Admin Test/i });
  await Question.deleteMany({ questionText: /Admin Draft/i });
  await mongoose.connection.close();
});
