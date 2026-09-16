const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const Question = require('../models/Question');
const app = require('../server');

const STUDENT_EMAIL = 'resume.student@example.com';

let studentToken;
let student;
let exam;

const loginToken = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123' });
  return res.headers['set-cookie'][0].split(';')[0].replace('token=', '');
};

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartexam');
  }
  await User.deleteMany({ email: STUDENT_EMAIL });
  await Exam.deleteMany({ title: 'Engine Resume Exam' });

  student = await User.create({ name: 'Resume Student', email: STUDENT_EMAIL, password: 'Password123', role: 'student' });
  exam = await Exam.create({
    title: 'Engine Resume Exam',
    description: 'Verify resume returns questions',
    subject: 'Biology',
    duration: 30,
    totalMarks: 2,
    passingMarks: 1,
    status: 'published',
    createdBy: student._id,
  });
  await Question.create({
    examId: exam._id,
    questionText: 'Engine Resume Q1',
    options: ['A', 'B'],
    correctAnswer: 0,
    marks: 2,
  });

  studentToken = await loginToken(STUDENT_EMAIL);
});

afterAll(async () => {
  await ExamAttempt.deleteMany({ examId: exam._id });
  await Question.deleteMany({ examId: exam._id });
  await Exam.deleteMany({ _id: exam._id });
  await User.deleteMany({ email: STUDENT_EMAIL });
  await mongoose.connection.close();
});

describe('Attempt resume', () => {
  it('returns the frozen questions when resuming an in-progress attempt', async () => {
    const first = await request(app)
      .post(`/api/exams/${exam._id}/start`)
      .set('Cookie', [`token=${studentToken}`]);
    expect(first.statusCode).toBe(201);
    expect(first.body.data.questions).toHaveLength(1);

    const second = await request(app)
      .post(`/api/exams/${exam._id}/start`)
      .set('Cookie', [`token=${studentToken}`]);
    expect(second.statusCode).toBe(200);
    expect(second.body.data.resumed).toBe(true);
    expect(second.body.data.questions).toHaveLength(1);
    expect(second.body.data.questions[0].questionText).toBe('Engine Resume Q1');
  });
});
