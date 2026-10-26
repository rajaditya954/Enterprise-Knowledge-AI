import { logger } from '../utils/logger.js';
import { config } from '../config.js';

/**
 * Custom application error with HTTP status code.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

/**
 * Centralized error handler. Never leaks stack traces in production.
 */
export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const isProduction = config.nodeEnv === 'production';

  if (statusCode >= 500) {
    logger.error({ err, path: req.path, method: req.method }, 'Server error');
  } else {
    logger.warn({ err: err.message, path: req.path }, 'Client error');
  }

  const response = {
    error: err.isOperational ? err.message : 'Internal server error',
  };

  if (err.details) {
    response.details = err.details;
  }

  if (!isProduction && !err.isOperational) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

/**
 * Wrap async route handlers to catch errors and pass them to errorHandler.
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
