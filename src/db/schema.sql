CREATE TABLE IF NOT EXISTS indexer_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS blocks (
  height INTEGER PRIMARY KEY,
  hash TEXT UNIQUE NOT NULL,
  previous_hash TEXT,
  time INTEGER,
  mediantime INTEGER,
  size INTEGER,
  difficulty_pos REAL,
  difficulty_pow REAL,
  tx_count INTEGER,
  block_type TEXT,
  reward INTEGER,
  subsidy INTEGER,
  transfer_volume_amount INTEGER DEFAULT 0,
  user_tx_count INTEGER DEFAULT 0,
  primary_amount INTEGER,
  primary_amount_kind TEXT,
  primary_amount_label TEXT,
  amount_badge TEXT,
  raw_output_volume_amount INTEGER DEFAULT 0,
  change_amount INTEGER DEFAULT 0,
  fee_amount INTEGER DEFAULT 0,
  amount_confidence TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  txid TEXT PRIMARY KEY,
  block_hash TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  time INTEGER,
  type TEXT,
  amount INTEGER,
  fee INTEGER,
  confirmations INTEGER,
  amount_raw_output INTEGER,
  amount_net_transfer INTEGER DEFAULT 0,
  change_amount INTEGER DEFAULT 0,
  fee_amount INTEGER,
  amount_kind TEXT,
  amount_confidence TEXT,
  FOREIGN KEY(block_height) REFERENCES blocks(height) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS addresses (
  address TEXT PRIMARY KEY,
  balance INTEGER DEFAULT 0,
  received INTEGER DEFAULT 0,
  sent INTEGER DEFAULT 0,
  tx_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS address_transactions (
  address TEXT NOT NULL,
  txid TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  amount INTEGER,
  type TEXT,
  PRIMARY KEY (address, txid, type),
  FOREIGN KEY(address) REFERENCES addresses(address) ON DELETE CASCADE,
  FOREIGN KEY(txid) REFERENCES transactions(txid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS utxos (
  txid TEXT NOT NULL,
  vout_index INTEGER NOT NULL,
  address TEXT NOT NULL,
  amount INTEGER NOT NULL,
  block_height INTEGER NOT NULL,
  PRIMARY KEY (txid, vout_index)
);

CREATE TABLE IF NOT EXISTS spent_utxos (
  spending_txid TEXT NOT NULL,
  spending_block_height INTEGER NOT NULL,
  prev_txid TEXT NOT NULL,
  prev_vout_index INTEGER NOT NULL,
  prev_block_height INTEGER NOT NULL,
  address TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (spending_txid, prev_txid, prev_vout_index)
);

CREATE INDEX IF NOT EXISTS idx_spent_utxos_spending_height
ON spent_utxos(spending_block_height);

CREATE INDEX IF NOT EXISTS idx_spent_utxos_prevout
ON spent_utxos(prev_txid, prev_vout_index);

CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);
CREATE INDEX IF NOT EXISTS idx_blocks_time ON blocks(time DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_type_height_time ON blocks(block_type, height DESC, time DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_height);
CREATE INDEX IF NOT EXISTS idx_transactions_block_hash ON transactions(block_hash);
CREATE INDEX IF NOT EXISTS idx_address_transactions_addr ON address_transactions(address);
CREATE INDEX IF NOT EXISTS idx_address_transactions_addr_height ON address_transactions(address, block_height DESC);
CREATE INDEX IF NOT EXISTS idx_address_transactions_height ON address_transactions(block_height);
CREATE INDEX IF NOT EXISTS idx_address_transactions_movement ON address_transactions(block_height DESC, amount);
CREATE INDEX IF NOT EXISTS idx_address_transactions_txid ON address_transactions(txid);
CREATE INDEX IF NOT EXISTS idx_addresses_balance ON addresses(balance DESC);
CREATE INDEX IF NOT EXISTS idx_utxos_address ON utxos(address);
CREATE INDEX IF NOT EXISTS idx_utxos_address_height ON utxos(address, block_height DESC);
CREATE INDEX IF NOT EXISTS idx_utxos_block_height ON utxos(block_height);

CREATE TABLE IF NOT EXISTS ai_attestations (
  txid TEXT PRIMARY KEY,
  block_hash TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  consensus_hash TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_type_code INTEGER NOT NULL,
  worker_count INTEGER NOT NULL,
  agreement_ratio REAL NOT NULL,
  ref_block_height INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(block_height) REFERENCES blocks(height) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_attestations_height ON ai_attestations(block_height DESC);
CREATE INDEX IF NOT EXISTS idx_ai_attestations_hash ON ai_attestations(consensus_hash);
CREATE INDEX IF NOT EXISTS idx_ai_attestations_type ON ai_attestations(task_type);

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
CREATE INDEX IF NOT EXISTS idx_glyphs_hash_edition ON glyphs(glyph_hash, edition);


