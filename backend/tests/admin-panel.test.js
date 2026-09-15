const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const Question = require('../models/Question');
const app = require('../server');

const ADMIN_EMAIL = 'panel.admin@example.com';
const STUDENT_ONE = 'panel.student1@example.com';
const STUDENT_TWO = 'panel.student2@example.com';
const EXAM_TITLE = 'Admin Panel Test Exam';

let adminToken;
let studentToken;
let admin;
let studentOne;
let studentTwo;
let exam;

const loginToken = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123' });
  if (!res.headers['set-cookie']) throw new Error(`login failed for ${email}: ${res.statusCode}`);
  return res.headers['set-cookie'][0].split(';')[0].replace('token=', '');
};

const cookie = (token) => [`token=${token}`];

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartexam');
  }
  await User.deleteMany({ email: { $in: [ADMIN_EMAIL, STUDENT_ONE, STUDENT_TWO] } });
  await Exam.deleteMany({ title: EXAM_TITLE });

  admin = await User.create({ name: 'Panel Admin', email: ADMIN_EMAIL, password: 'Password123', role: 'admin' });
  studentOne = await User.create({ name: 'Panel Student One', email: STUDENT_ONE, password: 'Password123', role: 'student' });
  // Deliberately awkward name so the CSV escaping can be asserted.
  studentTwo = await User.create({ name: 'Doe, "Jane"', email: STUDENT_TWO, password: 'Password123', role: 'student' });

  exam = await Exam.create({
    title: EXAM_TITLE,
    description: 'Exam used to verify admin result management',
    subject: 'Biology',
    duration: 25,
    totalMarks: 4,
    passingMarks: 2,
    status: 'published',
    createdBy: admin._id,
  });

  await Question.create({
    examId: exam._id,
    questionText: 'Panel Test Question',
    options: ['A', 'B'],
    correctAnswer: 1,
    marks: 4,
  });

  await ExamAttempt.create({
    userId: studentOne._id,
    examId: exam._id,
    startedAt: new Date(Date.now() - 20 * 60 * 1000),
    submittedAt: new Date(Date.now() - 10 * 60 * 1000),
    status: 'submitted',
    score: 4,
    totalMarks: 4,
    percentage: 100,
    correctAnswers: 1,
    incorrectAnswers: 0,
    unanswered: 0,
    passed: true,
  });

  await ExamAttempt.create({
    userId: studentTwo._id,
    examId: exam._id,
    startedAt: new Date(Date.now() - 15 * 60 * 1000),
    submittedAt: new Date(Date.now() - 5 * 60 * 1000),
    status: 'submitted',
    score: 0,
    totalMarks: 4,
    percentage: 0,
    correctAnswers: 0,
    incorrectAnswers: 1,
    unanswered: 0,
    passed: false,
  });

  adminToken = await loginToken(ADMIN_EMAIL);
  studentToken = await loginToken(STUDENT_ONE);
});

afterAll(async () => {
  await ExamAttempt.deleteMany({ examId: exam._id });
  await Question.deleteMany({ examId: exam._id });
  await Exam.deleteMany({ _id: exam._id });
  await User.deleteMany({ email: { $in: [ADMIN_EMAIL, STUDENT_ONE, STUDENT_TWO] } });
  await mongoose.connection.close();
});

describe('Admin panel', () => {
  it('returns dashboard stats including question totals', async () => {
    const res = await request(app).get('/api/admin/stats').set('Cookie', cookie(adminToken));

    expect(res.statusCode).toBe(200);
    expect(res.body.data.stats.totalQuestions).toBeGreaterThanOrEqual(1);
    expect(res.body.data.stats.totalStudents).toBeGreaterThanOrEqual(2);
    expect(res.body.data.stats.totalExams).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.data.stats.averageScore).toBe('number');
  });

  it('lists students with search and never returns passwords', async () => {
    const res = await request(app)
      .get('/api/admin/users?role=student&search=Panel%20Student')
      .set('Cookie', cookie(adminToken));

    expect(res.statusCode).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThanOrEqual(1);
    res.body.data.users.forEach((user) => {
      expect(user.password).toBeUndefined();
      expect(user.role).toBe('student');
    });
    expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('returns a student detail with attempts and summary', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${studentOne._id}`)
      .set('Cookie', cookie(adminToken));

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.email).toBe(STUDENT_ONE);
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.attempts.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.summary.attempts).toBeGreaterThanOrEqual(1);
    expect(res.body.data.summary.averagePercentage).toBeGreaterThanOrEqual(0);
    expect(res.body.data.attempts[0].timeTakenSeconds).toBeGreaterThanOrEqual(0);
  });

  it('handles invalid and unknown student identifiers', async () => {
    const invalid = await request(app)
      .get('/api/admin/users/not-an-id')
      .set('Cookie', cookie(adminToken));
    expect(invalid.statusCode).toBe(400);

    const missing = await request(app)
      .get(`/api/admin/users/${new mongoose.Types.ObjectId()}`)
      .set('Cookie', cookie(adminToken));
    expect(missing.statusCode).toBe(404);
  });

  it('blocks students and anonymous callers from admin endpoints', async () => {
    const asStudent = await request(app).get('/api/admin/stats').set('Cookie', cookie(studentToken));
    expect(asStudent.statusCode).toBe(403);

    const asStudentExport = await request(app).get('/api/admin/results/export').set('Cookie', cookie(studentToken));
    expect(asStudentExport.statusCode).toBe(403);

    const anonymous = await request(app).get('/api/admin/users');
    expect(anonymous.statusCode).toBe(401);

    const anonymousDetail = await request(app).get(`/api/admin/users/${studentOne._id}`);
    expect(anonymousDetail.statusCode).toBe(401);
  });

  it('filters, sorts and paginates results', async () => {
    const paged = await request(app)
      .get(`/api/admin/results?examId=${exam._id}&limit=1&page=1`)
      .set('Cookie', cookie(adminToken));

    expect(paged.statusCode).toBe(200);
    expect(paged.body.data.attempts.length).toBe(1);
    expect(paged.body.data.pagination.total).toBeGreaterThanOrEqual(2);
    expect(paged.body.data.pagination.pages).toBeGreaterThanOrEqual(2);

    const ascending = await request(app)
      .get(`/api/admin/results?examId=${exam._id}&sort=score&order=asc`)
      .set('Cookie', cookie(adminToken));

    expect(ascending.statusCode).toBe(200);
    const scores = ascending.body.data.attempts.map((attempt) => attempt.score);
    expect(scores[0]).toBeLessThanOrEqual(scores[scores.length - 1]);

    const byStatus = await request(app)
      .get(`/api/admin/results?examId=${exam._id}&status=submitted`)
      .set('Cookie', cookie(adminToken));
    expect(byStatus.statusCode).toBe(200);

    const badExam = await request(app)
      .get('/api/admin/results?examId=not-an-id')
      .set('Cookie', cookie(adminToken));
    expect(badExam.statusCode).toBe(400);

    const badUser = await request(app)
      .get('/api/admin/results?userId=not-an-id')
      .set('Cookie', cookie(adminToken));
    expect(badUser.statusCode).toBe(400);
  });

  it('searches results by student name and email', async () => {
    const res = await request(app)
      .get('/api/admin/results?search=Doe')
      .set('Cookie', cookie(adminToken));

    expect(res.statusCode).toBe(200);
    expect(res.body.data.attempts.length).toBeGreaterThanOrEqual(1);
    res.body.data.attempts.forEach((attempt) => {
      expect(attempt.userId.email).toBe(STUDENT_TWO);
    });
  });

  it('exports a correctly escaped CSV download', async () => {
    const res = await request(app)
      .get(`/api/admin/results/export?examId=${exam._id}`)
      .set('Cookie', cookie(adminToken));

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.csv');

    const header = 'Student,Email,Exam,Subject,Score,Total Marks,Percentage,Correct,Incorrect,Unanswered,Passed,Status,Submitted At';
    expect(res.text).toContain(header);
    // A name containing a comma and quotes must be CSV-escaped, not injected raw.
    expect(res.text).toContain('"Doe, ""Jane"""');
    expect(res.text).not.toContain('password');
  });

  it('guards student account controls', async () => {
    const selfDisable = await request(app)
      .patch(`/api/admin/users/${admin._id}/toggle-status`)
      .set('Cookie', cookie(adminToken))
      .send({ isActive: false });
    expect(selfDisable.statusCode).toBe(400);

    const badPayload = await request(app)
      .patch(`/api/admin/users/${studentOne._id}/toggle-status`)
      .set('Cookie', cookie(adminToken))
      .send({ isActive: 'yes' });
    expect(badPayload.statusCode).toBe(400);

    const disabled = await request(app)
      .patch(`/api/admin/users/${studentOne._id}/toggle-status`)
      .set('Cookie', cookie(adminToken))
      .send({ isActive: false });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.body.data.user.isActive).toBe(false);

    const reEnabled = await request(app)
      .patch(`/api/admin/users/${studentOne._id}/toggle-status`)
      .set('Cookie', cookie(adminToken))
      .send({ isActive: true });
    expect(reEnabled.body.data.user.isActive).toBe(true);

    const missing = await request(app)
      .patch(`/api/admin/users/${new mongoose.Types.ObjectId()}/toggle-status`)
      .set('Cookie', cookie(adminToken))
      .send({ isActive: false });
    expect(missing.statusCode).toBe(404);
  });
});