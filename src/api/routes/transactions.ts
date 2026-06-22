import { Router } from 'express';
import { db } from '../../db/db.js';
import { loadTxIoFromIndex } from '../utils/txIo.js';

const router = Router();

router.get('/latest', async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? '25'), 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 25;

    const rows = await db.all(`
      SELECT txid, block_height, block_hash, time, fee, amount_raw_output, amount
      FROM transactions
      WHERE type = 'normal_transfer'
      ORDER BY block_height DESC, rowid DESC
      LIMIT ?
    `, limit) as Array<{
      txid: string;
      block_height: number;
      block_hash: string;
      time: number;
      fee: number;
      amount_raw_output: number | null;
      amount: number | null;
    }>;

    const transactions = [];
    for (const row of rows) {
      const io = await loadTxIoFromIndex(row.txid);
      transactions.push({
        txid: row.txid,
        blockHeight: row.block_height,
        blockHash: row.block_hash,
        time: row.time,
        recipientCount: io.recipients.length,
        amount: io.output_total,
        fee: io.fee,
        recipients: io.recipients,
      });
    }

    res.json({
      transactions,
      _display_version: 6,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
