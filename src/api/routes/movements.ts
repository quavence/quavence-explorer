import { Router } from 'express';
import { db } from '../../db/db.js';
import { QUAVENCE } from '../../config.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    // Validate limit
    const requestedLimit = Number.parseInt(String(req.query.limit ?? '50'), 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;

    // Validate offset
    const requestedOffset = Number.parseInt(String(req.query.offset ?? '0'), 10);
    const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    // Get movements
    const movements = await db.all(`
      SELECT
        at.address,
        at.txid,
        at.block_height,
        at.amount,
        at.type,
        t.time
      FROM address_transactions at
      JOIN transactions t ON t.txid = at.txid
      WHERE at.amount != 0
      ORDER BY at.block_height DESC, t.time DESC
      LIMIT ?
      OFFSET ?
    `, limit, offset) as {
      address: string;
      txid: string;
      block_height: number;
      amount: number;
      type: string;
      time: number;
    }[];

    // Get total count for pagination
    const totalRow = await db.get('SELECT COUNT(*) as total FROM address_transactions WHERE amount != 0') as { total: number };

    const items = movements.map((row) => {
      const amountAbs = Math.abs(row.amount);
      const balanceFormatted = (amountAbs / QUAVENCE.coin).toFixed(8);
      const parts = balanceFormatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      const formatted = parts.join('.') + ' ' + QUAVENCE.ticker;

      return {
        time: row.time,
        blockHeight: row.block_height,
        txid: row.txid,
        address: row.address,
        amount: row.amount,
        amountAbs,
        amountFormatted: formatted,
        direction: row.amount > 0 ? 'received' : 'sent',
        type: row.type
      };
    });

    res.json({
      items,
      pagination: {
        limit,
        offset,
        total: totalRow.total
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;