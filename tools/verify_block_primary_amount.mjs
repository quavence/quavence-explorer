#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { computeBlockAmountFields } from '../src/indexer/blockAmount.ts';
import { enrichBlockAmountFromTransactions } from '../src/api/utils/blockAmount.ts';
import { loadTxIoFromIndex } from '../src/api/utils/txIo.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dbPath = path.join(__dirname, '../data/verify-primary-amount.sqlite');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = await open({ filename: dbPath, driver: sqlite3.Database });
await db.exec(fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8'));

async function insertBlock({ height, reward, tx_count }) {
  await db.run(`
    INSERT INTO blocks (
      height, hash, previous_hash, time, mediantime, size,
      difficulty_pos, difficulty_pow, tx_count, block_type, reward, subsidy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  );
}

async function insertTx({ txid, block_height, type, amount, fee = 0 }) {
  await db.run(`
    INSERT INTO transactions (
      txid, block_hash, block_height, time, type, amount, fee, confirmations,
      amount_raw_output, fee_amount
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `,
    txid,
    `hash-${block_height}`,
    block_height,
    1_700_000_000 + block_height,
    type,
    amount,
    fee,
    amount,
    fee,
  );
}

try {
  const rewardOnlySat = 4_010_000;
  await insertBlock({ height: 100, reward: rewardOnlySat, tx_count: 2 });
  await insertTx({ txid: 'tx-reward-only', block_height: 100, type: 'stake_reward', amount: rewardOnlySat });

  const rewardFields = computeBlockAmountFields({
    reward_amount: rewardOnlySat,
    raw_output_volume_amount: 0,
    fee_amount: 0,
    user_tx_count: 0,
    has_reward_tx: true,
  });
  assert(rewardFields.primary_amount === rewardOnlySat, 'reward-only primary equals reward');
  assert(rewardFields.amount_badge === 'reward', 'reward-only badge');

  const transferSat = 7_503_333;
  const feeSat = 10_000;
  await insertBlock({ height: 28513, reward: rewardOnlySat, tx_count: 3 });
  await insertTx({ txid: 'tx-reward', block_height: 28513, type: 'stake_reward', amount: rewardOnlySat });
  await insertTx({ txid: 'tx-transfer', block_height: 28513, type: 'normal_transfer', amount: transferSat, fee: feeSat });
  await db.run(`
    INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, prev_block_height, address, amount)
    VALUES ('tx-transfer', 28513, 'prev-a', 0, 28512, 'SXsenderA', 4990000),
           ('tx-transfer', 28513, 'prev-b', 1, 28500, 'SXsenderB', 2523333)
  `);
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES ('tx-transfer', 0, 'SXbot', 6000000, 28513)
  `);
  await db.run(`
    INSERT INTO address_transactions (address, txid, block_height, amount, type)
    VALUES ('SXbot', 'tx-transfer', 28513, 6000000, 'received'),
           ('SXchange', 'tx-transfer', 28513, 1503333, 'received')
  `);

  const io = await loadTxIoFromIndex('tx-transfer', db);
  assert(io.output_total === transferSat, 'tx io output total must equal sum of outputs');
  assert(io.recipients.length === 2, 'tx io must include every indexed recipient');
  assert(io.recipients.some((row) => row.address === 'SXbot' && row.amount === 6000000), 'bot output must be visible');
  assert(io.fee === feeSat, 'tx io fee must be inputs minus outputs');

  const enriched = await enrichBlockAmountFromTransactions(await db.get('SELECT * FROM blocks WHERE height = 28513'), db);
  assert(enriched.primary_amount === rewardOnlySat, 'block list primary stays reward');
  assert(enriched.raw_output_volume_amount === transferSat, 'block transfer output total is factual');
  assert(enriched.amount_badge === 'mixed', 'mixed badge when reward and transfer coexist');

  console.log('verify_block_primary_amount: PASS');
} catch (error) {
  console.error('verify_block_primary_amount: FAIL', error?.message || error);
  process.exitCode = 1;
} finally {
  await db.close().catch(() => {});
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}
