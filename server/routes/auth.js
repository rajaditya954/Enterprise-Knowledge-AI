import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { randomToken, hashToken } from '../utils/crypto.js';
import { authenticate, generateAccessToken, parseExpiresIn } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// Login rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Schemas ───
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']),
  departmentId: z.string().uuid(),
});

// ─── POST /auth/login ───
router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        error: 'Account is locked. Please try again later.',
        lockedUntil: user.locked_until,
      });
    }

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      // Increment failed attempts
      const newAttempts = user.failed_login_attempts + 1;
      const lockout =
        newAttempts >= config.security.maxLoginAttempts
          ? new Date(Date.now() + config.security.lockoutDurationMin * 60 * 1000)
          : null;

      await query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
        [newAttempts, lockout, user.id]
      );

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset failed attempts
    await query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = randomToken();
    const refreshHash = hashToken(refreshToken);
    const refreshExpiry = new Date(Date.now() + parseExpiresIn(config.jwt.refreshExpiresIn));

    // Store refresh token
    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshHash, refreshExpiry]
    );

    // Set refresh token cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: parseExpiresIn(config.jwt.refreshExpiresIn),
      path: '/api/auth',
    });

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, event_type, ip_address) VALUES ($1, 'LOGIN', $2)`,
      [user.id, req.ip]
    );

    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.department_id,
      },
    });
  })
);

// ─── POST /auth/refresh ───
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const tokenHash = hashToken(refreshToken);
    const result = await query(
      `SELECT rt.*, u.email, u.role, u.department_id, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const row = result.rows[0];
    if (!row.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Rotate refresh token
    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);

    const newRefreshToken = randomToken();
    const newHash = hashToken(newRefreshToken);
    const newExpiry = new Date(Date.now() + parseExpiresIn(config.jwt.refreshExpiresIn));

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [row.user_id, newHash, newExpiry]
    );

    const accessToken = generateAccessToken({
      id: row.user_id,
      email: row.email,
      role: row.role,
      department_id: row.department_id,
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: parseExpiresIn(config.jwt.refreshExpiresIn),
      path: '/api/auth',
    });

    res.json({ accessToken });
  })
);

// ─── POST /auth/logout ───
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    }

    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Logged out' });
  })
);

// ─── GET /auth/me ───
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT u.id, u.email, u.role, u.department_id, d.name as department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.department_id,
      departmentName: user.department_name,
    });
  })
);

export default router;
