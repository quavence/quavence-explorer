#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { computeBlockAmountFields } from '../src/indexer/blockAmount.ts';
import { enrichBlockAmountFromTransactions } from '../src/api/utils/blockAmount.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dbPath = path.join(__dirname, '../data/verify-primary-amount.sqlite');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = await open({ filename: dbPath, driver: sqlite3.Database });
await db.exec(fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8'));

async function insertBlock({ height, reward, tx_count, stored = false, transfer_volume_amount = 0, user_tx_count = 0, primary_amount = null, primary_amount_kind = null, primary_amount_label = null, amount_badge = null }) {
  await db.run(`
    INSERT INTO blocks (
      height, hash, previous_hash, time, mediantime, size,
      difficulty_pos, difficulty_pow, tx_count, block_type, reward, subsidy,
      transfer_volume_amount, user_tx_count, primary_amount, primary_amount_kind, primary_amount_label, amount_badge
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    height,
    `hash-${height}`,
    height > 0 ? `hash-${height - 1}` : null,
    1_700_000_000 + height,
    1_700_000_000 + height,
    1024,
    1.5,
    0,
    tx_count,
    'pos',
    reward,
    4_000_000,
    stored ? transfer_volume_amount : 0,
    stored ? user_tx_count : 0,
    stored ? primary_amount : null,
    stored ? primary_amount_kind : null,
    stored ? primary_amount_label : null,
    stored ? amount_badge : null,
  );
}

async function insertTx({ txid, block_height, type, amount }) {
  await db.run(`
    INSERT INTO transactions (txid, block_hash, block_height, time, type, amount, fee, confirmations)
    VALUES (?, ?, ?, ?, ?, ?, 0, 1)
  `, txid, `hash-${block_height}`, block_height, 1_700_000_000 + block_height, type, amount);
}

try {
  // 1) Old DB fallback: no stored primary fields, compute-on-read
  const rewardOnlySat = 4_000_000;
  await insertBlock({ height: 100, reward: rewardOnlySat, tx_count: 1 });
  await insertTx({ txid: 'tx-reward-only', block_height: 100, type: 'stake_reward', amount: rewardOnlySat });

  const oldRow = await db.get('SELECT * FROM blocks WHERE height = 100');
  assert(oldRow.primary_amount_kind == null, 'fixture: old block must not have stored primary_amount_kind');

  const enrichedOld = await enrichBlockAmountFromTransactions(oldRow, db);
  assert(enrichedOld.primary_amount != null, 'fallback: primary_amount must not be null');
  assert(enrichedOld.primary_amount === rewardOnlySat, 'fallback: primary_amount must equal reward');
  assert(enrichedOld.primary_amount_kind === 'block_reward', 'fallback: kind must be block_reward');
  assert(enrichedOld.amount_badge === 'reward', 'fallback: badge must be Reward');
  console.log('OK fallback for old blocks (compute-on-read)');

  // 2) Reward-only block semantics
  const rewardFields = computeBlockAmountFields({
    reward_amount: rewardOnlySat,
    transfer_volume_amount: 0,
    user_tx_count: 0,
    has_reward_tx: true,
  });
  assert(rewardFields.amount_badge === 'reward', 'reward-only: badge Reward');
  assert(rewardFields.primary_amount === rewardOnlySat, 'reward-only: primary equals reward');
  assert(rewardFields.primary_amount_label === 'Reward only', 'reward-only: label Reward only');
  console.log('OK reward-only block semantics');

  // 3) Mixed block: reward + transfer
  const transferSat = 17_748_959;
  const mixedRewardSat = 4_000_000;
  await insertBlock({ height: 200, reward: mixedRewardSat, tx_count: 2 });
  await insertTx({ txid: 'tx-mixed-reward', block_height: 200, type: 'stake_reward', amount: mixedRewardSat });
  await insertTx({ txid: 'tx-mixed-transfer', block_height: 200, type: 'normal_transfer', amount: transferSat });

  const mixedRow = await db.get('SELECT * FROM blocks WHERE height = 200');
  const enrichedMixed = await enrichBlockAmountFromTransactions(mixedRow, db);
  assert(enrichedMixed.amount_badge === 'mixed', 'mixed: badge Mixed');
  assert(enrichedMixed.primary_amount === transferSat, 'mixed: primary equals transfer volume sum');
  assert(enrichedMixed.transfer_volume_amount === transferSat, 'mixed: transfer_volume_amount matches tx sum');
  assert(enrichedMixed.primary_amount_kind === 'transfer_volume', 'mixed: kind transfer_volume');
  assert(enrichedMixed.primary_amount_label === 'Output volume', 'mixed: honest output volume label');

  const listEnriched = await enrichBlockAmountFromTransactions(mixedRow, db);
  const detailEnriched = await enrichBlockAmountFromTransactions(mixedRow, db);
  assert(listEnriched.transfer_volume_amount === detailEnriched.transfer_volume_amount, 'list/detail output volume must match');
  assert(listEnriched.primary_amount === detailEnriched.primary_amount, 'list/detail primary amount must match');
  console.log('OK mixed block semantics and list/detail parity');

  console.log('verify_block_primary_amount: PASS');
} catch (error) {
  console.error('verify_block_primary_amount: FAIL', error?.message || error);
  process.exitCode = 1;
} finally {
  await db.close().catch(() => {});
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}
