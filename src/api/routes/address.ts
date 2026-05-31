import { Router } from 'express';
import { db } from '../../db/db.js';
import { isValidQuavenceAddress } from '../utils/base58.js';

const router = Router();

router.get('/:address', async (req, res) => {
  try {
    const address = req.params.address;

    // Validate address format
    if (!isValidQuavenceAddress(address)) {
      return res.status(400).json({ error: 'Invalid Quavence address' });
    }

    const limit = parseInt(req.query.limit as string || '50', 10);
    const offset = parseInt(req.query.offset as string || '0', 10);

    // Get address summary
    const info = await db.get('SELECT * FROM addresses WHERE address = ?', address) as any;

    if (!info) {
      // Address has no activity yet
      return res.json({
        address,
        balance: 0,
        received: 0,
        sent: 0,
        txCount: 0,
        tx_count: 0,
        transactions: [],
        utxos: [],
        indexed: false,
        pagination: { limit, offset, total: 0 }
      });
    }

    // Get address transactions with their parent transaction types
    const txs = await db.all(`
      SELECT at.txid, at.block_height, at.amount, at.type, t.type as tx_type
      FROM address_transactions at
      JOIN transactions t ON at.txid = t.txid
      WHERE at.address = ?
      ORDER BY at.block_height DESC
      LIMIT ? OFFSET ?
    `, address, limit, offset);

    // Get total count
    const totalRow = await db.get('SELECT COUNT(*) as count FROM address_transactions WHERE address = ?', address) as { count: number };

    // Get UTXOs
    const utxos = await db.all(`
      SELECT txid, vout_index, amount, block_height
      FROM utxos
      WHERE address = ?
      ORDER BY block_height DESC
    `, address);

    res.json({
      address: info.address,
      balance: info.balance,
      received: info.received,
      sent: info.sent,
      txCount: info.tx_count,
      transactions: txs,
      utxos,
      indexed: true,
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

export default router;
