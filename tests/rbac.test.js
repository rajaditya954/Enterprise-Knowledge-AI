import { describe, it, expect } from 'vitest';
import { canAccessDocument } from '../server/middleware/rbac.js';

// Helper to create mock user/document
const user = (role, departmentId) => ({ role, departmentId });
const doc = (department_id, permission_level) => ({ department_id, permission_level });

describe('RBAC — canAccessDocument', () => {
  // ─── ADMIN ───
  describe('ADMIN', () => {
    it('can access any document at any level in any department', () => {
      expect(canAccessDocument(user('ADMIN', 'dept-1'), doc('dept-1', 1))).toBe(true);
      expect(canAccessDocument(user('ADMIN', 'dept-1'), doc('dept-1', 4))).toBe(true);
      expect(canAccessDocument(user('ADMIN', 'dept-1'), doc('dept-2', 4))).toBe(true);
    });
  });

  // ─── MANAGER ───
  describe('MANAGER', () => {
    it('can access own department up to level 3', () => {
      expect(canAccessDocument(user('MANAGER', 'dept-1'), doc('dept-1', 1))).toBe(true);
      expect(canAccessDocument(user('MANAGER', 'dept-1'), doc('dept-1', 2))).toBe(true);
      expect(canAccessDocument(user('MANAGER', 'dept-1'), doc('dept-1', 3))).toBe(true);
    });

    it('CANNOT access own department level 4 (Restricted)', () => {
      expect(canAccessDocument(user('MANAGER', 'dept-1'), doc('dept-1', 4))).toBe(false);
    });

    it('can access other departments up to level 2', () => {
      expect(canAccessDocument(user('MANAGER', 'dept-1'), doc('dept-2', 1))).toBe(true);
      expect(canAccessDocument(user('MANAGER', 'dept-1'), doc('dept-2', 2))).toBe(true);
    });

    it('CANNOT access other departments level 3+', () => {
      expect(canAccessDocument(user('MANAGER', 'dept-1'), doc('dept-2', 3))).toBe(false);
      expect(canAccessDocument(user('MANAGER', 'dept-1'), doc('dept-2', 4))).toBe(false);
    });
  });

  // ─── EMPLOYEE ───
  describe('EMPLOYEE', () => {
    it('can access own department up to level 2', () => {
      expect(canAccessDocument(user('EMPLOYEE', 'dept-1'), doc('dept-1', 1))).toBe(true);
      expect(canAccessDocument(user('EMPLOYEE', 'dept-1'), doc('dept-1', 2))).toBe(true);
    });

    it('CANNOT access own department level 3+ (Confidential/Restricted)', () => {
      expect(canAccessDocument(user('EMPLOYEE', 'dept-1'), doc('dept-1', 3))).toBe(false);
      expect(canAccessDocument(user('EMPLOYEE', 'dept-1'), doc('dept-1', 4))).toBe(false);
    });

    it('can access other departments at level 1 only', () => {
      expect(canAccessDocument(user('EMPLOYEE', 'dept-1'), doc('dept-2', 1))).toBe(true);
    });

    it('CANNOT access other departments level 2+', () => {
      expect(canAccessDocument(user('EMPLOYEE', 'dept-1'), doc('dept-2', 2))).toBe(false);
      expect(canAccessDocument(user('EMPLOYEE', 'dept-1'), doc('dept-2', 3))).toBe(false);
      expect(canAccessDocument(user('EMPLOYEE', 'dept-1'), doc('dept-2', 4))).toBe(false);
    });
  });

  // ─── Edge cases ───
  describe('Edge Cases', () => {
    it('unknown role defaults to deny', () => {
      expect(canAccessDocument(user('INTERN', 'dept-1'), doc('dept-1', 1))).toBe(false);
    });

    it('EMPLOYEE with same department boundary (level 2 = allowed, level 3 = denied)', () => {
      const u = user('EMPLOYEE', 'dept-hr');
      expect(canAccessDocument(u, doc('dept-hr', 2))).toBe(true);
      expect(canAccessDocument(u, doc('dept-hr', 3))).toBe(false);
    });

    it('MANAGER cross-department boundary (level 2 = allowed, level 3 = denied)', () => {
      const u = user('MANAGER', 'dept-eng');
      expect(canAccessDocument(u, doc('dept-fin', 2))).toBe(true);
      expect(canAccessDocument(u, doc('dept-fin', 3))).toBe(false);
    });
  });
});
