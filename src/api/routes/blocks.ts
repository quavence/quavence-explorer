import { Router } from 'express';
import { db } from '../../db/db.js';
import { enrichBlockAmountFromTransactions, enrichBlocksListFromTransactions } from '../utils/blockAmount.js';
import { enrichTxAmountFromIndex } from '../utils/txAmount.js';

const router = Router();

const BLOCK_LIST_COLUMNS = `
  height, hash, previous_hash, time, mediantime, size,
  difficulty_pos, difficulty_pow, tx_count, block_type, reward,
  transfer_volume_amount, user_tx_count, primary_amount,
  primary_amount_kind, primary_amount_label, amount_badge
`;

// List blocks
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || '50', 10);
    const offset = parseInt(req.query.offset as string || '0', 10);

    const blocks = await db.all(`
      SELECT ${BLOCK_LIST_COLUMNS}
      FROM blocks
      ORDER BY height DESC
      LIMIT ? OFFSET ?
    `, limit, offset);

    const totalRow = await db.get('SELECT COUNT(*) as count FROM blocks') as { count: number };

    res.json({
      blocks: await enrichBlocksListFromTransactions(blocks),
      pagination: {
        limit,
        offset,
        total: totalRow.count,
      },
      _amount_enrichment_version: 3,
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

    const txs = await db.all(`
      SELECT txid, block_hash, block_height, time, type, amount, fee, confirmations,
             amount_raw_output, amount_net_transfer, change_amount, fee_amount,
             amount_kind, amount_confidence
      FROM transactions
      WHERE block_hash = ?
      ORDER BY rowid ASC
    `, (block as any).hash);

    const enrichedBlock = await enrichBlockAmountFromTransactions(block as Record<string, unknown>);
    const enrichedTxs = [];
    for (const tx of txs) {
      enrichedTxs.push(await enrichTxAmountFromIndex(tx as Record<string, unknown>));
    }

    res.json({
      ...enrichedBlock,
      transactions: enrichedTxs,
      _amount_enrichment_version: 3,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
