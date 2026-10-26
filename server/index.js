import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

// Routes
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import chatRoutes from './routes/chat.js';
import conversationRoutes from './routes/conversations.js';
import adminRoutes from './routes/admin.js';
import healthRoutes from './routes/health.js';

const app = express();

// ─── Security Middleware ───
app.use(helmet());
app.use(
  cors({
    origin: config.security.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Global rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ─── Body Parsers ───
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Request Logging ───
app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path, ip: req.ip }, 'request');
  next();
});

// ─── Routes ───
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/health', healthRoutes);

// ─── 404 ───
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error Handler ───
app.use(errorHandler);

// ─── Start Server ───
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'Enterprise Knowledge AI server started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    const { closePool } = await import('./db.js');
    await closePool();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  server.close(async () => {
    const { closePool } = await import('./db.js');
    await closePool();
    process.exit(0);
  });
});

export default app;
