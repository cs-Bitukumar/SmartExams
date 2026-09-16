require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { connectDB } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const examRoutes = require('./routes/examRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');
// Render/most PaaS deployments sit behind a single reverse proxy. Trusting one hop
// gives express-rate-limit the real client IP and lets secure cookies work correctly.
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: false,
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const configured = (process.env.CLIENT_URL || 'http://localhost:3000')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (configured.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// The general limit deliberately excludes static HTML/CSS/JS so that assets
// cannot consume the request budget, and students behind shared campus IPs get
// a realistic budget for autosave + periodic server-time resync during exams.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test' || req.method === 'GET' || req.path.startsWith('/api/health'),
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
});
app.use('/api', generalLimiter);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SmartExam backend is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);

app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Resource not found' });
});

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', req.method, req.originalUrl, err.message);
  let status = err.status || 500;
  let message = 'Something went wrong. Please try again.';
  if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid resource identifier';
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors)[0]?.message || 'The submitted data is invalid';
  } else if (err.code === 11000) {
    status = 409;
    message = 'A record with those details already exists';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'The request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'The request body is too large';
  } else if (status < 500 && err.message) {
    message = err.message;
  }
  res.status(status).json({
    success: false,
    message,
    errors: [],
  });
});

const startServer = async () => {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured in production');
  }
  await connectDB();
  app.listen(PORT, () => {
    console.log(`SmartExam server running on http://localhost:${PORT}`);
  });
};

if (require.main === module) {
  startServer();
}

module.exports = app;
