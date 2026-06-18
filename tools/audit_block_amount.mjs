#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const height = Number(process.argv[2] || 23793);
const dbPath = path.join(__dirname, '../data/explorer.sqlite');

const db = await open({ filename: dbPath, driver: sqlite3.Database });

const block = await db.get('SELECT * FROM blocks WHERE height = ?', height);
console.log('BLOCK', JSON.stringify(block, null, 2));

const txs = await db.all('SELECT * FROM transactions WHERE block_height = ?', height);
for (const tx of txs) {
  console.log('\nTX', tx.txid, tx.type);
  console.log('  amount', tx.amount, 'raw', tx.amount_raw_output, 'net', tx.amount_net_transfer, 'change', tx.change_amount);
  console.log('  kind', tx.amount_kind, 'confidence', tx.amount_confidence, 'fee', tx.fee);

  const inputs = await db.all('SELECT * FROM spent_utxos WHERE spending_txid = ?', tx.txid);
  console.log('  spent_utxos:', inputs);

  const outputs = await db.all(
    `SELECT address, amount, type FROM address_transactions WHERE txid = ? ORDER BY type, amount DESC`,
    tx.txid,
  );
  console.log('  address_transactions:', outputs);
}

await db.close();
