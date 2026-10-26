import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { handleQuery } from '../services/rag.js';
import { query } from '../db.js';

const router = Router();

const querySchema = z.object({
  question: z.string().min(1).max(5000),
  conversationId: z.string().uuid().optional(),
});

// ─── POST /chat/query — SSE Streaming RAG ───
router.post(
  '/query',
  authenticate,
  validate(querySchema),
  asyncHandler(async (req, res) => {
    const { question, conversationId } = req.body;

    // If no conversationId, create one
    let convId = conversationId;
    if (!convId) {
      const result = await query(
        `INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
        [req.user.id, question.substring(0, 100)]
      );
      convId = result.rows[0].id;
    }

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Conversation-Id': convId,
    });

    // Send conversation ID as first event
    res.write(`event: conversation\ndata: ${JSON.stringify({ conversationId: convId })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      res.end();
    });

    // Run RAG pipeline
    await handleQuery({
      question,
      user: req.user,
      conversationId: convId,
      res,
    });
  })
);

export default router;
