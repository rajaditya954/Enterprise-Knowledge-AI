import crypto from 'node:crypto';

/**
 * Compute SHA-256 hex digest of a buffer.
 */
export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate a cryptographically random hex token.
 */
export function randomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a refresh token for storage (SHA-256).
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
