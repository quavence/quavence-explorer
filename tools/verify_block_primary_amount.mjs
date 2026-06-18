#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { computeBlockAmountFields } from '../src/indexer/blockAmount.ts';
import { enrichBlockAmountFromTransactions, enrichBlocksListFromTransactions } from '../src/api/utils/blockAmount.ts';

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

async function insertTx({
  txid, block_height, type, amount,
  amount_net_transfer = null,
  amount_raw_output = null,
  change_amount = 0,
  amount_confidence = null,
}) {
  await db.run(`
    INSERT INTO transactions (
      txid, block_hash, block_height, time, type, amount, fee, confirmations,
      amount_raw_output, amount_net_transfer, change_amount, fee_amount, amount_kind, amount_confidence
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, 0, ?, ?)
  `,
    txid,
    `hash-${block_height}`,
    block_height,
    1_700_000_000 + block_height,
    type,
    amount,
    amount_raw_output ?? amount,
    amount_net_transfer ?? 0,
    change_amount,
    type === 'normal_transfer' ? 'transfer' : null,
    amount_confidence,
  );
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
  await insertTx({
    txid: 'tx-mixed-transfer',
    block_height: 200,
    type: 'normal_transfer',
    amount: transferSat,
    amount_net_transfer: transferSat,
    amount_raw_output: transferSat,
    amount_confidence: 'exact',
  });
  await db.run(`
    INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, prev_block_height, address, amount)
    VALUES ('tx-mixed-transfer', 200, 'prev-mixed', 0, 199, 'SXsender', ?)
  `, [transferSat + 1_000_000]);
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES ('tx-mixed-transfer', 0, 'SXrecipient', ?, 200)
  `, [transferSat]);

  const mixedRow = await db.get('SELECT * FROM blocks WHERE height = 200');
  const enrichedMixed = await enrichBlockAmountFromTransactions(mixedRow, db);
  assert(enrichedMixed.amount_badge === 'mixed', 'mixed: badge Mixed');
  assert(enrichedMixed.primary_amount === transferSat, 'mixed: primary equals transfer volume sum');
  assert(enrichedMixed.transfer_volume_amount === transferSat, 'mixed: transfer_volume_amount matches tx sum');
  assert(enrichedMixed.primary_amount_kind === 'transfer', 'mixed: kind transfer');
  assert(enrichedMixed.primary_amount_label === 'Transferred', 'mixed: transferred label');

  const listEnriched = await enrichBlockAmountFromTransactions(mixedRow, db);
  const detailEnriched = await enrichBlockAmountFromTransactions(mixedRow, db);
  assert(listEnriched.transfer_volume_amount === detailEnriched.transfer_volume_amount, 'list/detail output volume must match');
  assert(listEnriched.primary_amount === detailEnriched.primary_amount, 'list/detail primary amount must match');
  console.log('OK mixed block semantics and list/detail parity');

  // 4) Stale stored block_reward must not override transfer txs (dashboard/list bug)
  const oneQvncSat = 100_000_000;
  const changeSat = 66_125_990_000;
  const rewardPlusFeeSat = 4_100_000;
  await insertBlock({
    height: 23765,
    reward: rewardPlusFeeSat,
    tx_count: 3,
    stored: true,
    transfer_volume_amount: 0,
    user_tx_count: 0,
    primary_amount: rewardPlusFeeSat,
    primary_amount_kind: 'block_reward',
    primary_amount_label: 'Reward only',
    amount_badge: 'reward',
  });
  await insertTx({ txid: 'tx-23765-reward', block_height: 23765, type: 'stake_reward', amount: rewardPlusFeeSat });
  await insertTx({
    txid: 'tx-23765-transfer',
    block_height: 23765,
    type: 'normal_transfer',
    amount: oneQvncSat + changeSat,
    amount_raw_output: oneQvncSat + changeSat,
  });
  await db.run(`
    INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, prev_block_height, address, amount)
    VALUES ('tx-23765-transfer', 23765, 'prev-utxo', 0, 23764, 'SXsender', ?)
  `, [oneQvncSat + changeSat + 1_000_000]);
  await db.run(`
    INSERT INTO address_transactions (address, txid, block_height, amount, type)
    VALUES ('SXrecipient', 'tx-23765-transfer', 23765, ?, 'received')
  `, [oneQvncSat]);
  await db.run(`
    INSERT INTO address_transactions (address, txid, block_height, amount, type)
    VALUES ('SXsender', 'tx-23765-transfer', 23765, ?, 'received')
  `, [changeSat]);
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES ('tx-23765-transfer', 0, 'SXrecipient', ?, 23765),
           ('tx-23765-transfer', 1, 'SXsender', ?, 23765)
  `, [oneQvncSat, changeSat]);

  const staleRow = await db.get('SELECT * FROM blocks WHERE height = 23765');
  const enrichedStale = await enrichBlockAmountFromTransactions(staleRow, db);
  assert(enrichedStale.primary_amount === oneQvncSat, 'stale stored reward must not win over net transfer');
  assert(enrichedStale.amount_badge === 'mixed', 'stale stored row with transfers must be Mixed');
  assert(enrichedStale.primary_amount_label === 'Transferred', 'net transfer label must be Transferred');
  assert(enrichedStale.change_amount === changeSat, 'change amount must be aggregated');
  assert(enrichedStale.primary_amount !== rewardPlusFeeSat, 'must not show reward+fee as primary amount');
  console.log('OK stale stored block_reward overridden by transfer txs');

  // 5) Dashboard latest-blocks path uses same batch enrichment as /blocks
  const dashboardRows = await db.all('SELECT * FROM blocks WHERE height IN (100, 23765) ORDER BY height DESC');
  const batchEnriched = await enrichBlocksListFromTransactions(dashboardRows, db);
  const dashboardBlock = batchEnriched.find((row) => row.height === 23765);
  const blocksListBlock = await enrichBlockAmountFromTransactions(staleRow, db);
  assert(dashboardBlock?.primary_amount === blocksListBlock.primary_amount, 'dashboard/list primary_amount must match');
  assert(dashboardBlock?.amount_badge === blocksListBlock.amount_badge, 'dashboard/list badge must match');
  console.log('OK dashboard latest blocks matches /blocks enrichment');

  // 6) Multi-input spend: small output back to input addr, large external output is change
  const change23793 = 57_962_990_000;
  await insertBlock({
    height: 23793,
    reward: 4_000_000,
    tx_count: 3,
    stored: true,
    transfer_volume_amount: change23793,
    user_tx_count: 1,
    primary_amount: change23793,
    primary_amount_kind: 'transfer',
    primary_amount_label: 'Transferred',
    amount_badge: 'mixed',
  });
  await insertTx({
    txid: 'tx-23793-transfer',
    block_height: 23793,
    type: 'normal_transfer',
    amount: oneQvncSat + change23793,
    amount_raw_output: oneQvncSat + change23793,
    amount_net_transfer: change23793,
    change_amount: oneQvncSat,
    amount_confidence: 'exact',
  });
  await db.run(`
    INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, prev_block_height, address, amount)
    VALUES ('tx-23793-transfer', 23793, 'prev-a', 0, 23792, 'SXsender', ?),
           ('tx-23793-transfer', 23793, 'prev-b', 0, 23790, 'SXfunding', ?)
  `, [oneQvncSat, change23793 + 1_000_000]);
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES ('tx-23793-transfer', 0, 'SXsender', ?, 23793),
           ('tx-23793-transfer', 1, 'SXrecipient', ?, 23793)
  `, [oneQvncSat, change23793]);

  const row23793 = await db.get('SELECT * FROM blocks WHERE height = 23793');
  const enriched23793 = await enrichBlockAmountFromTransactions(row23793, db);
  assert(enriched23793.primary_amount === oneQvncSat, 'block 23793 must show 1 QVNC net transfer');
  assert(enriched23793.change_amount === change23793, 'block 23793 change must exclude payment');
  assert(enriched23793.primary_amount_label === 'Transferred', 'block 23793 label Transferred');
  console.log('OK block 23793 multi-input change correction');

  console.log('verify_block_primary_amount: PASS');
} catch (error) {
  console.error('verify_block_primary_amount: FAIL', error?.message || error);
  process.exitCode = 1;
} finally {
  await db.close().catch(() => {});
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}
