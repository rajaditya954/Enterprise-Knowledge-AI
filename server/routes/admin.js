import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = Router();

// All admin routes require authentication
router.use(authenticate);

// ─── User Management ───

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']),
  departmentId: z.string().uuid(),
});

const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
  departmentId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

// GET /admin/users
router.get(
  '/users',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT u.id, u.email, u.role, u.department_id, u.is_active, u.created_at,
              d.name as department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       ORDER BY u.created_at DESC`
    );
    res.json({ users: result.rows });
  })
);

// POST /admin/users
router.post(
  '/users',
  requireRole('ADMIN'),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const { email, password, role, departmentId } = req.body;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new AppError('Email already in use', 409);
    }

    const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);
    const result = await query(
      `INSERT INTO users (email, password_hash, role, department_id)
       VALUES ($1, $2, $3, $4) RETURNING id, email, role, department_id, is_active, created_at`,
      [email, passwordHash, role, departmentId]
    );

    res.status(201).json(result.rows[0]);
  })
);

// PATCH /admin/users/:id
router.patch(
  '/users/:id',
  requireRole('ADMIN'),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const { role, departmentId, isActive } = req.body;
    const userId = req.params.id;

    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    if (role !== undefined) {
      setClauses.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (departmentId !== undefined) {
      setClauses.push(`department_id = $${paramIndex++}`);
      params.push(departmentId);
    }
    if (isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    if (setClauses.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    params.push(userId);
    const result = await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, role, department_id, is_active`,
      params
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, event_type, metadata, ip_address)
       VALUES ($1, 'ROLE_CHANGE', $2, $3)`,
      [
        req.user.id,
        JSON.stringify({ targetUserId: userId, changes: req.body }),
        req.ip,
      ]
    );

    res.json(result.rows[0]);
  })
);

// ─── Audit Logs ───

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  eventType: z.enum(['QUERY', 'UPLOAD', 'DELETE', 'LOGIN', 'ROLE_CHANGE', 'ACCESS_DENIED']).optional(),
  userId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get(
  '/audit-logs',
  requireRole('ADMIN', 'MANAGER'),
  validateQuery(auditQuerySchema),
  asyncHandler(async (req, res) => {
    const { page, limit, eventType, userId, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Managers can only see their own department's logs
    if (req.user.role === 'MANAGER') {
      whereConditions.push(
        `(al.user_id IN (SELECT id FROM users WHERE department_id = $${paramIndex}))`
      );
      params.push(req.user.departmentId);
      paramIndex++;
    }

    if (eventType) {
      whereConditions.push(`al.event_type = $${paramIndex++}`);
      params.push(eventType);
    }
    if (userId) {
      whereConditions.push(`al.user_id = $${paramIndex++}`);
      params.push(userId);
    }
    if (startDate) {
      whereConditions.push(`al.created_at >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      whereConditions.push(`al.created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [logsResult, countResult] = await Promise.all([
      query(
        `SELECT al.*, u.email as user_email
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*) FROM audit_logs al ${whereClause}`, params),
    ]);

    res.json({
      logs: logsResult.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count, 10),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / limit),
      },
    });
  })
);

// ─── Departments ───

router.get(
  '/departments',
  asyncHandler(async (_req, res) => {
    const result = await query('SELECT * FROM departments ORDER BY name');
    res.json({ departments: result.rows });
  })
);

// ─── RBAC Info ───

router.get(
  '/rbac',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json({
      roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'],
      permissionLevels: [
        { level: 1, name: 'Public', description: 'Accessible to all employees' },
        { level: 2, name: 'Internal', description: 'Department-level and managers company-wide' },
        { level: 3, name: 'Confidential', description: 'Department managers only' },
        { level: 4, name: 'Restricted', description: 'Admins only' },
      ],
      rules: {
        ADMIN: 'All departments and all permission levels',
        MANAGER: 'Own department up to level 3, plus level 1-2 company-wide',
        EMPLOYEE: 'Own department up to level 2, plus level 1 company-wide',
      },
    });
  })
);

export default router;
