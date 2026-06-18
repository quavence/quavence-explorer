#!/usr/bin/env node
import { initDb, db } from '../src/db/db.js';
import { backfillTxAmountColumns } from '../src/api/utils/txAmount.js';
import { enrichBlockAmountFromTransactions } from '../src/api/utils/blockAmount.js';
import { computeBlockAmountFields } from '../src/indexer/blockAmount.js';

const heightArg = process.argv[2];
const limitArg = process.argv[3];

async function backfillBlock(height) {
  const txs = await db.all(`
    SELECT txid, type, fee, amount
    FROM transactions
    WHERE block_height = ?
      AND type = 'normal_transfer'
      AND (amount_confidence IS NULL OR amount_confidence = '')
  `, height);

  for (const tx of txs) {
    await backfillTxAmountColumns(tx);
  }

  const block = await db.get('SELECT * FROM blocks WHERE height = ?', height);
  if (!block) return;

  const enriched = await enrichBlockAmountFromTransactions(block);
  const fields = computeBlockAmountFields({
    reward_amount: block.reward,
    transfer_volume_amount: enriched.transfer_volume_amount,
    raw_output_volume_amount: enriched.raw_output_volume_amount,
    change_amount: enriched.change_amount,
    fee_amount: enriched.fee_amount,
    user_tx_count: enriched.user_tx_count,
    has_reward_tx: Number(enriched.user_tx_count || 0) < Number(block.tx_count || 0),
    amount_confidence: enriched.amount_confidence,
  });

  await db.run(`
    UPDATE blocks
    SET transfer_volume_amount = ?,
        raw_output_volume_amount = ?,
        change_amount = ?,
        fee_amount = ?,
        user_tx_count = ?,
        primary_amount = ?,
        primary_amount_kind = ?,
        primary_amount_label = ?,
        amount_badge = ?,
        amount_confidence = ?
    WHERE height = ?
  `,
    fields.transfer_volume_amount,
    fields.raw_output_volume_amount,
    fields.change_amount,
    fields.fee_amount,
    fields.user_tx_count,
    fields.primary_amount,
    fields.primary_amount_kind,
    fields.primary_amount_label,
    fields.amount_badge,
    fields.amount_confidence,
    height,
  );

  console.log(`backfilled block ${height}: primary=${fields.primary_amount} label=${fields.primary_amount_label}`);
}

try {
  await initDb();

  if (heightArg) {
    await backfillBlock(Number(heightArg));
  } else {
    const limit = Number(limitArg || 500);
    const rows = await db.all(`
      SELECT height
      FROM blocks
      ORDER BY height DESC
      LIMIT ?
    `, limit);
    for (const row of rows) {
      await backfillBlock(Number(row.height));
    }
  }

  console.log('backfill_net_transfer_amounts: done');
} catch (error) {
  console.error('backfill_net_transfer_amounts: FAIL', error?.message || error);
  process.exitCode = 1;
} finally {
  await db.close().catch(() => {});
}
