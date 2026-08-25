const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const app = require('../server');

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartexam');
  }
});

beforeEach(async () => {
  await User.deleteMany({ email: 'student@example.com' });
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe('Authentication API', () => {
  it('registers a new student user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Student',
        email: 'student@example.com',
        password: 'Password123',
        confirmPassword: 'Password123',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('student@example.com');
  });

  it('logs in an existing user', async () => {
    await User.create({
      name: 'Test Student',
      email: 'student@example.com',
      password: 'Password123',
      role: 'student',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'student@example.com',
        password: 'Password123',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('student@example.com');
  });
});
