import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { validateQuery } from '../middleware/validate.js';
import { query } from '../db.js';

const router = Router();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ─── GET /conversations ───
router.get(
  '/',
  authenticate,
  validateQuery(listSchema),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count
       FROM conversations c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM conversations WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      conversations: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count, 10),
      },
    });
  })
);

// ─── GET /conversations/:id ───
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const convResult = await query(
      'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (convResult.rows.length === 0) {
      throw new AppError('Conversation not found', 404);
    }

    const messagesResult = await query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    res.json({
      conversation: convResult.rows[0],
      messages: messagesResult.rows,
    });
  })
);

// ─── DELETE /conversations/:id ───
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Conversation not found', 404);
    }

    res.json({ message: 'Conversation deleted' });
  })
);

export default router;
