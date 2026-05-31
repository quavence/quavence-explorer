import { Router } from 'express';
import { db } from '../../db/db.js';

const router = Router();

// List blocks
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || '50', 10);
    const offset = parseInt(req.query.offset as string || '0', 10);

    const blocks = await db.all(`
      SELECT height, hash, previous_hash, time, mediantime, size, difficulty_pos, difficulty_pow, tx_count, block_type, reward
      FROM blocks
      ORDER BY height DESC
      LIMIT ? OFFSET ?
    `, limit, offset);

    const totalRow = await db.get('SELECT COUNT(*) as count FROM blocks') as { count: number };

    res.json({
      blocks,
      pagination: {
        limit,
        offset,
        total: totalRow.count,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get block by height or hash
router.get('/:heightOrHash', async (req, res) => {
  try {
    const param = req.params.heightOrHash;
    let block;
    if (/^\d+$/.test(param)) {
      const height = parseInt(param, 10);
      block = await db.get('SELECT * FROM blocks WHERE height = ?', height);
    } else {
      block = await db.get('SELECT * FROM blocks WHERE hash = ?', param);
    }

    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    // Load transactions for this block
    const txs = await db.all(`
      SELECT txid, block_hash, block_height, time, type, amount, fee, confirmations
      FROM transactions
      WHERE block_hash = ?
      ORDER BY rowid ASC
    `, (block as any).hash);

    res.json({
      ...block,
      transactions: txs,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
