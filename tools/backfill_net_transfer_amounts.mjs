#!/usr/bin/env node
import { initDb, db } from '../src/db/db.ts';
import { enrichBlockAmountFromTransactions } from '../src/api/utils/blockAmount.ts';
import { computeBlockAmountFields } from '../src/indexer/blockAmount.ts';

const heightArg = process.argv.find((arg) => /^\d+$/.test(arg));
const limitArg = process.argv.find((arg, index, args) => {
  const prev = args[index - 1];
  return prev === '--limit' && /^\d+$/.test(arg);
});

async function backfillBlock(height) {
  const block = await db.get('SELECT * FROM blocks WHERE height = ?', height);
  if (!block) return;

  const enriched = await enrichBlockAmountFromTransactions(block);
  const fields = computeBlockAmountFields({
    reward_amount: block.reward,
    raw_output_volume_amount: enriched.raw_output_volume_amount,
    fee_amount: enriched.fee_amount,
    user_tx_count: enriched.user_tx_count,
    has_reward_tx: Number(enriched.user_tx_count || 0) < Number(block.tx_count || 0),
  });

  await db.run(`
    UPDATE blocks
    SET raw_output_volume_amount = ?,
        fee_amount = ?,
        user_tx_count = ?,
        primary_amount = ?,
        primary_amount_kind = ?,
        primary_amount_label = ?,
        amount_badge = ?,
        amount_confidence = ?
    WHERE height = ?
  `,
    fields.raw_output_volume_amount,
    fields.fee_amount,
    fields.user_tx_count,
    fields.primary_amount,
    fields.primary_amount_kind,
    fields.primary_amount_label,
    fields.amount_badge,
    fields.amount_confidence,
    height,
  );

  console.log(`backfilled block ${height}: reward=${fields.primary_amount} badge=${fields.amount_badge}`);
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

  console.log('backfill_block_amounts: done');
} catch (error) {
  console.error('backfill_block_amounts: FAIL', error?.message || error);
  process.exitCode = 1;
} finally {
  await db.close().catch(() => {});
}
