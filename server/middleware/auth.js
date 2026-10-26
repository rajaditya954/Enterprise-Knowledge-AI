import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { logger } from '../utils/logger.js';

/**
 * Authenticate middleware — verifies JWT access token from Authorization header.
 * Attaches req.user = { id, email, role, departmentId }.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      departmentId: payload.departmentId,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    logger.warn({ err: err.message }, 'JWT verification failed');
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Require specific roles. Returns 403 if the user's role is not in the allowed list.
 * Usage: requireRole('ADMIN', 'MANAGER')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      // Log denied access
      logAccessDenied(req).catch(() => {});
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

async function logAccessDenied(req) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, event_type, ip_address, metadata)
       VALUES ($1, 'ACCESS_DENIED', $2, $3)`,
      [
        req.user?.id,
        req.ip,
        JSON.stringify({ path: req.path, method: req.method, role: req.user?.role }),
      ]
    );
  } catch (err) {
    logger.error({ err }, 'Failed to write access denied audit log');
  }
}

/**
 * Generate a short-lived access token.
 */
export function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.department_id || user.departmentId,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

/**
 * Parse the JWT expiration string into milliseconds.
 */
export function parseExpiresIn(expiresIn) {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * (multipliers[unit] || 86400000);
}
