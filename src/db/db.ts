import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure data folder exists
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'explorer.sqlite');

export let db: Database;

export async function initDb(): Promise<void> {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.run('PRAGMA foreign_keys = ON');
  await db.run('PRAGMA busy_timeout = 5000');
  await db.run('PRAGMA journal_mode = WAL');
  await db.run('PRAGMA synchronous = NORMAL');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(schema);
  await migrateGlyphsTable();
  await migrateBlockAmountColumns();
  await migrateNetTransferColumns();
  await db.run('PRAGMA optimize');
}

async function migrateGlyphsTable(): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS glyphs (
      txid TEXT PRIMARY KEY,
      block_hash TEXT NOT NULL,
      block_height INTEGER NOT NULL,
      block_time INTEGER NOT NULL,
      glyph_hash TEXT NOT NULL,
      edition INTEGER NOT NULL,
      op_type INTEGER NOT NULL,
      op_label TEXT NOT NULL,
      carrier_address TEXT,
      carrier_vout INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_glyphs_height ON glyphs(block_height DESC);
    CREATE INDEX IF NOT EXISTS idx_glyphs_carrier_address ON glyphs(carrier_address);
    CREATE INDEX IF NOT EXISTS idx_glyphs_hash ON glyphs(glyph_hash);
    CREATE INDEX IF NOT EXISTS idx_glyphs_edition ON glyphs(edition);
  `);
}

async function migrateNetTransferColumns(): Promise<void> {
  const blockColumns = await db.all('PRAGMA table_info(blocks)') as Array<{ name: string }>;
  const blockNames = new Set(blockColumns.map((column) => column.name));
  const blockAdditions: Array<[string, string]> = [
    ['raw_output_volume_amount', 'INTEGER DEFAULT 0'],
    ['change_amount', 'INTEGER DEFAULT 0'],
    ['fee_amount', 'INTEGER DEFAULT 0'],
    ['amount_confidence', 'TEXT'],
  ];
  for (const [name, type] of blockAdditions) {
    if (!blockNames.has(name)) {
      await db.run(`ALTER TABLE blocks ADD COLUMN ${name} ${type}`);
    }
  }

  const txColumns = await db.all('PRAGMA table_info(transactions)') as Array<{ name: string }>;
  const txNames = new Set(txColumns.map((column) => column.name));
  const txAdditions: Array<[string, string]> = [
    ['amount_raw_output', 'INTEGER'],
    ['amount_net_transfer', 'INTEGER DEFAULT 0'],
    ['change_amount', 'INTEGER DEFAULT 0'],
    ['fee_amount', 'INTEGER'],
    ['amount_kind', 'TEXT'],
    ['amount_confidence', 'TEXT'],
  ];
  for (const [name, type] of txAdditions) {
    if (!txNames.has(name)) {
      await db.run(`ALTER TABLE transactions ADD COLUMN ${name} ${type}`);
    }
  }
}

async function migrateBlockAmountColumns(): Promise<void> {
  const columns = await db.all('PRAGMA table_info(blocks)') as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  const additions: Array<[string, string]> = [
    ['transfer_volume_amount', 'INTEGER DEFAULT 0'],
    ['user_tx_count', 'INTEGER DEFAULT 0'],
    ['primary_amount', 'INTEGER'],
    ['primary_amount_kind', 'TEXT'],
    ['primary_amount_label', 'TEXT'],
    ['amount_badge', 'TEXT'],
  ];

  for (const [name, type] of additions) {
    if (!names.has(name)) {
      await db.run(`ALTER TABLE blocks ADD COLUMN ${name} ${type}`);
    }
  }
}

// State helper methods
export async function getIndexerHeight(): Promise<number> {
  const row = await db.get('SELECT value FROM indexer_state WHERE key = ?', 'last_indexed_height');
  return row ? parseInt(row.value, 10) : -1;
}

export async function setIndexerHeight(height: number): Promise<void> {
  await db.run('INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)', 'last_indexed_height', height.toString());
}

export async function rollbackToHeight(forkHeight: number): Promise<void> {
  if (!Number.isInteger(forkHeight) || forkHeight < 0) {
    throw new Error(`Invalid rollback fork height: ${forkHeight}`);
  }

  await db.run('BEGIN TRANSACTION');
  try {
    await db.run(`
      INSERT OR REPLACE INTO utxos (txid, vout_index, address, amount, block_height)
      SELECT prev_txid, prev_vout_index, address, amount, prev_block_height
      FROM spent_utxos
      WHERE spending_block_height >= ?
    `, forkHeight);

    await db.run('DELETE FROM utxos WHERE block_height >= ?', forkHeight);
    await db.run('DELETE FROM glyphs WHERE block_height >= ?', forkHeight);
    await db.run('DELETE FROM spent_utxos WHERE spending_block_height >= ?', forkHeight);
    await db.run('DELETE FROM address_transactions WHERE block_height >= ?', forkHeight);
    await db.run('DELETE FROM transactions WHERE block_height >= ?', forkHeight);
    await db.run('DELETE FROM blocks WHERE height >= ?', forkHeight);

    await db.run('DROP TABLE IF EXISTS temp.address_rebuild');
    await db.run(`
      CREATE TEMP TABLE address_rebuild AS
      SELECT
        address,
        COALESCE(SUM(amount), 0) AS balance,
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS received,
        COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS sent,
        COUNT(DISTINCT txid) AS tx_count
      FROM address_transactions
      GROUP BY address
    `);

    await db.run(`
      UPDATE addresses
      SET
        balance = (SELECT balance FROM address_rebuild WHERE address_rebuild.address = addresses.address),
        received = (SELECT received FROM address_rebuild WHERE address_rebuild.address = addresses.address),
        sent = (SELECT sent FROM address_rebuild WHERE address_rebuild.address = addresses.address),
        tx_count = (SELECT tx_count FROM address_rebuild WHERE address_rebuild.address = addresses.address)
      WHERE EXISTS (
        SELECT 1 FROM address_rebuild WHERE address_rebuild.address = addresses.address
      )
    `);

    await db.run(`
      INSERT INTO addresses (address, balance, received, sent, tx_count)
      SELECT address, balance, received, sent, tx_count
      FROM address_rebuild
      WHERE NOT EXISTS (
        SELECT 1 FROM addresses WHERE addresses.address = address_rebuild.address
      )
    `);

    await db.run(`
      DELETE FROM addresses
      WHERE NOT EXISTS (
        SELECT 1 FROM address_rebuild WHERE address_rebuild.address = addresses.address
      )
    `);
    await db.run('DROP TABLE temp.address_rebuild');

    await db.run("INSERT OR REPLACE INTO indexer_state (key, value) VALUES ('last_indexed_height', ?)", (forkHeight - 1).toString());
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
}

export async function clearAllData(): Promise<void> {
  const tables = ['address_transactions', 'spent_utxos', 'utxos', 'transactions', 'addresses', 'blocks', 'indexer_state'];
  
  await db.run('BEGIN TRANSACTION');
  try {
    for (const table of tables) {
      await db.run(`DELETE FROM ${table}`);
    }
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
}
