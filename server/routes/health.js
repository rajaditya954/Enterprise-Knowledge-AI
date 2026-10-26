import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const start = Date.now();
    const dbResult = await query('SELECT 1');
    const dbLatency = Date.now() - start;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: {
        connected: dbResult.rows.length > 0,
        latencyMs: dbLatency,
      },
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    });
  })
);

export default router;
