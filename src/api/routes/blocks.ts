import { Router } from 'express';
import { db } from '../../db/db.js';
import { enrichBlockAmountFromTransactions, enrichBlocksListFromTransactions } from '../utils/blockAmount.js';
import { enrichTxAmountFromIndex } from '../utils/txAmount.js';
import { isRewardTransactionType } from '../../indexer/blockAmount.js';

const router = Router();

const BLOCK_LIST_COLUMNS = `
  height, hash, previous_hash, time, mediantime, size,
  difficulty_pos, difficulty_pow, tx_count, block_type, reward,
  user_tx_count, transfer_volume_amount, raw_output_volume_amount,
  primary_amount, primary_amount_kind, primary_amount_label, amount_badge
`;

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string || '0', 10) || 0, 0);
    const filter = (req.query.filter as string || '').toLowerCase().trim();

    let whereClause = '';
    if (filter === 'glyphs') {
      whereClause = 'WHERE EXISTS (SELECT 1 FROM glyphs g WHERE g.block_height = blocks.height)';
    } else if (filter === 'attestations') {
      whereClause = 'WHERE EXISTS (SELECT 1 FROM ai_attestations a WHERE a.block_height = blocks.height)';
    } else if (filter === 'transfers') {
      whereClause = 'WHERE user_tx_count > 0 OR transfer_volume_amount > 0';
    }

    const blocks = await db.all(`
      SELECT ${BLOCK_LIST_COLUMNS}
      FROM blocks
      ${whereClause}
      ORDER BY height DESC
      LIMIT ? OFFSET ?
    `, limit, offset);

    const totalRow = await db.get(`SELECT COUNT(*) as count FROM blocks ${whereClause}`) as { count: number };

    res.json({
      blocks: await enrichBlocksListFromTransactions(blocks),
      pagination: {
        limit,
        offset,
        total: totalRow.count,
      },
      filter: filter || 'all',
      _amount_enrichment_version: 8,
    });
  } catch (error: any) {
    console.error('Error fetching blocks list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
      if (String(tx.type) === 'normal_transfer') {
        const enriched = await enrichTxAmountFromIndex(tx);
        const recipients = (enriched.recipient_outputs as Array<Record<string, unknown>>) || [];
        const changeOutputs = (enriched.change_outputs as Array<Record<string, unknown>>) || [];
        enrichedTxs.push({
          ...enriched,
          recipient_count: recipients.length,
          transfer_amount: enriched.amount_net_transfer,
          output_total: enriched.amount_raw_output,
          change_total: enriched.change_amount,
          recipients,
          change_outputs: changeOutputs,
          fee: enriched.fee_amount ?? enriched.fee,
        });
      } else {
        const subsidyAmount = Number(tx.amount ?? 0);
        enrichedTxs.push({
          ...tx,
          recipient_count: isRewardTransactionType(String(tx.type)) ? 1 : 0,
          output_total: subsidyAmount,
          fee: Number(tx.fee_amount ?? tx.fee ?? 0),
        });
      }
    }

    res.json({
      ...enrichedBlock,
      transactions: enrichedTxs,
      _amount_enrichment_version: 7,
    });
  } catch (error: any) {
    console.error('Error fetching block details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
