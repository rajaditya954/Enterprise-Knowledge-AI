import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { canAccessDocument } from '../middleware/rbac.js';
import { uploadDocument, reindexDocument, deleteDocument, getJobStatus } from '../services/ingestion.js';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.resolve('uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});

// Multer config
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: (_req, file, cb) => {
    if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(`Unsupported file type: ${file.mimetype}`, 400));
    }
  },
});

const uploadQuerySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  departmentId: z.string().uuid(),
  permissionLevel: z.coerce.number().int().min(1).max(4),
  docType: z.string().max(50).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']).optional(),
  departmentId: z.string().uuid().optional(),
});

// ─── POST /documents — Upload ───
router.post(
  '/',
  authenticate,
  requireRole('ADMIN', 'MANAGER'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const params = uploadQuerySchema.parse(req.body);

    const document = await uploadDocument({
      file: req.file,
      title: params.title,
      departmentId: params.departmentId,
      permissionLevel: params.permissionLevel,
      docType: params.docType,
      uploadedBy: req.user.id,
    });

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, event_type, metadata, ip_address)
       VALUES ($1, 'UPLOAD', $2, $3)`,
      [req.user.id, JSON.stringify({ documentId: document.id, title: document.title }), req.ip]
    );

    res.status(201).json(document);
  })
);

// ─── GET /documents — List ───
router.get(
  '/',
  authenticate,
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const { page, limit, status, departmentId } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [
      `check_rbac_access($1, $2, d.department_id, d.permission_level)`,
    ];
    let params = [req.user.role, req.user.departmentId];
    let paramIndex = 3;

    if (status) {
      whereConditions.push(`d.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (departmentId) {
      whereConditions.push(`d.department_id = $${paramIndex}`);
      params.push(departmentId);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    const [docsResult, countResult] = await Promise.all([
      query(
        `SELECT d.*, dept.name as department_name,
                u.email as uploaded_by_email,
                (SELECT COUNT(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunk_count
         FROM documents d
         JOIN departments dept ON dept.id = d.department_id
         LEFT JOIN users u ON u.id = d.uploaded_by
         WHERE ${whereClause}
         ORDER BY d.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      query(
        `SELECT COUNT(*) FROM documents d WHERE ${whereClause}`,
        params
      ),
    ]);

    res.json({
      documents: docsResult.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count, 10),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / limit),
      },
    });
  })
);

// ─── GET /documents/:id ───
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT d.*, dept.name as department_name
       FROM documents d
       JOIN departments dept ON dept.id = d.department_id
       WHERE d.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Document not found', 404);
    }

    const document = result.rows[0];
    if (!canAccessDocument(req.user, document)) {
      throw new AppError('Access denied', 403);
    }

    res.json(document);
  })
);

// ─── POST /documents/:id/reindex ───
router.post(
  '/:id/reindex',
  authenticate,
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const docResult = await query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (docResult.rows.length === 0) {
      throw new AppError('Document not found', 404);
    }

    if (!canAccessDocument(req.user, docResult.rows[0])) {
      throw new AppError('Access denied', 403);
    }

    reindexDocument(req.params.id).catch(() => {});
    res.json({ message: 'Re-indexing started', documentId: req.params.id });
  })
);

// ─── DELETE /documents/:id ───
router.delete(
  '/:id',
  authenticate,
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const docResult = await query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (docResult.rows.length === 0) {
      throw new AppError('Document not found', 404);
    }

    if (!canAccessDocument(req.user, docResult.rows[0])) {
      throw new AppError('Access denied', 403);
    }

    await deleteDocument(req.params.id);

    await query(
      `INSERT INTO audit_logs (user_id, event_type, metadata, ip_address)
       VALUES ($1, 'DELETE', $2, $3)`,
      [req.user.id, JSON.stringify({ documentId: req.params.id }), req.ip]
    );

    res.json({ message: 'Document deleted' });
  })
);

// ─── GET /documents/:id/status ───
router.get(
  '/:id/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const docResult = await query(
      'SELECT id, status, error_message, version FROM documents WHERE id = $1',
      [req.params.id]
    );
    if (docResult.rows.length === 0) {
      throw new AppError('Document not found', 404);
    }

    const jobStatus = getJobStatus(req.params.id);
    res.json({ ...docResult.rows[0], jobStatus });
  })
);

export default router;
