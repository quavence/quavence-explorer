import { Router, Request, Response } from 'express';
import { db } from '../../db/db.js';

const router = Router();

// GET /api/attestations - List recent AI attestations
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '20', 10)));
    const offset = Math.max(0, parseInt(req.query.offset as string || '0', 10));
    const taskType = req.query.task_type ? String(req.query.task_type).trim() : null;

    let query = 'SELECT * FROM ai_attestations';
    const params: any[] = [];

    if (taskType) {
      query += ' WHERE task_type = ?';
      params.push(taskType);
    }

    query += ' ORDER BY block_height DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await db.all(query, ...params);
    const countRow = await db.get(
      taskType 
        ? 'SELECT COUNT(*) as count FROM ai_attestations WHERE task_type = ?'
        : 'SELECT COUNT(*) as count FROM ai_attestations',
      ...(taskType ? [taskType] : [])
    );

    res.json({
      total: countRow?.count || 0,
      limit,
      offset,
      attestations: rows || [],
    });
  } catch (error: any) {
    console.error('[API /api/attestations] Error:', error);
    res.status(500).json({ error: 'Failed to fetch AI attestations' });
  }
});

// GET /api/attestations/stats - Overall stats on AI attestations
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const totalRow = await db.get('SELECT COUNT(*) as total, AVG(agreement_ratio) as avg_agreement, AVG(worker_count) as avg_workers FROM ai_attestations');
    const byType = await db.all('SELECT task_type, COUNT(*) as count FROM ai_attestations GROUP BY task_type');

    res.json({
      total_attestations: totalRow?.total || 0,
      average_agreement: Number((totalRow?.avg_agreement || 0).toFixed(4)),
      average_workers: Number((totalRow?.avg_workers || 0).toFixed(2)),
      by_task_type: byType || [],
    });
  } catch (error: any) {
    console.error('[API /api/attestations/stats] Error:', error);
    res.status(500).json({ error: 'Failed to fetch attestation statistics' });
  }
});

// GET /api/attestations/:txid - Get specific attestation by TXID
router.get('/:txid', async (req: Request, res: Response) => {
  try {
    const { txid } = req.params;
    const row = await db.get('SELECT * FROM ai_attestations WHERE txid = ?', txid);
    if (!row) {
      return res.status(404).json({ error: 'Attestation not found' });
    }
    res.json(row);
  } catch (error: any) {
    console.error(`[API /api/attestations/${req.params.txid}] Error:`, error);
    res.status(500).json({ error: 'Failed to fetch attestation' });
  }
});

export default router;
