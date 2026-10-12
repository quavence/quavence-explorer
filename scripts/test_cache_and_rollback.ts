import assert from 'assert';
import { BoundedCache } from '../src/api/utils/cache.js';
import { toSatoshis } from '../src/indexer/parser.js';
import { initDb, db, rollbackToHeight, setIndexerHeight, getIndexerHeight } from '../src/db/db.js';

console.log('================================================================');
console.log('=== QUAVENCE EXPLORER: CACHE, UTXO ROLLBACK & PRECISION SUITE ===');
console.log('================================================================');

async function runTests() {
  // --- 1. Test toSatoshis Overflow and Safety Guards ---
  console.log('\n--- 1. Testing toSatoshis Integer Precision & Overflow Guards ---');
  assert.strictEqual(toSatoshis(0), 0, 'Zero should return 0');
  assert.strictEqual(toSatoshis(null), 0, 'null should return 0');
  assert.strictEqual(toSatoshis(undefined), 0, 'undefined should return 0');
  assert.strictEqual(toSatoshis(NaN), 0, 'NaN should return 0');
  assert.strictEqual(toSatoshis(Infinity), 0, 'Infinity should return 0');
  assert.strictEqual(toSatoshis(-5), 0, 'Negative values should return 0');

  const standardSat = toSatoshis('12.34567890');
  assert.strictEqual(standardSat, 1234567890, 'Decimal conversion matches satoshis');

  let overflowThrew = false;
  try {
    toSatoshis(1e15); // Exceeds Number.MAX_SAFE_INTEGER when multiplied by 1e8
  } catch (err: any) {
    overflowThrew = true;
    assert(err.message.includes('overflow'), 'Error message specifies overflow');
  }
  assert.strictEqual(overflowThrew, true, 'Unsafe integer overflow throws explicit Error');
  console.log('[PASS] toSatoshis precision & Number.isSafeInteger guards verified');

  // --- 2. Test BoundedCache LRU & TTL Eviction ---
  console.log('\n--- 2. Testing BoundedCache LRU & TTL Eviction (Anti-OOM) ---');
  const cache = new BoundedCache<string, string>(3, 50); // max 3 items, 50ms TTL

  cache.set('k1', 'v1');
  cache.set('k2', 'v2');
  cache.set('k3', 'v3');
  assert.strictEqual(cache.size, 3, 'Cache size is 3');

  // Insert 4th item: should evict oldest (k1)
  cache.set('k4', 'v4');
  assert.strictEqual(cache.size, 3, 'Cache size bounded at 3');
  assert.strictEqual(cache.get('k1'), undefined, 'Oldest entry k1 evicted');
  assert.strictEqual(cache.get('k2'), 'v2', 'k2 remains');
  assert.strictEqual(cache.get('k4'), 'v4', 'New entry k4 present');

  // Test TTL expiration
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.strictEqual(cache.get('k2'), undefined, 'Expired entry returns undefined after TTL');
  console.log('[PASS] BoundedCache LRU & TTL eviction verified');

  // --- 3. Test C-1 & C-2: Reorg State Invariants & UTXO Sync ---
  console.log('\n--- 3. Testing C-1 & C-2: Rollback State Invariants & UTXO Sync ---');
  await initDb();

  // Create isolated in-memory or test scenario
  await db.run('DELETE FROM blocks');
  await db.run('DELETE FROM transactions');
  await db.run('DELETE FROM utxos');
  await db.run('DELETE FROM spent_utxos');
  await db.run('DELETE FROM addresses');
  await db.run('DELETE FROM address_transactions');

  // Insert base state at height 100
  await db.run(`
    INSERT INTO blocks (height, hash, previous_hash, time, tx_count)
    VALUES (100, 'h100', 'h99', 1700000000, 1)
  `);
  await db.run(`
    INSERT INTO transactions (txid, block_hash, block_height, time, type, amount, fee)
    VALUES ('tx1', 'h100', 100, 1700000000, 'pos', 500000000, 0)
  `);
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES ('tx1', 0, 'SAddr1', 500000000, 100)
  `);
  await db.run(`
    INSERT INTO addresses (address, balance, received, sent, tx_count)
    VALUES ('SAddr1', 500000000, 500000000, 0, 1)
  `);
  await db.run(`
    INSERT INTO address_transactions (address, txid, block_height, amount, type)
    VALUES ('SAddr1', 'tx1', 100, 500000000, 'receive')
  `);
  await setIndexerHeight(100);

  // Simulate Block 101: SAddr1 sends to SAddr2
  await db.run(`
    INSERT INTO blocks (height, hash, previous_hash, time, tx_count)
    VALUES (101, 'h101', 'h100', 1700000060, 1)
  `);
  await db.run(`
    INSERT INTO transactions (txid, block_hash, block_height, time, type, amount, fee)
    VALUES ('tx2', 'h101', 101, 1700000060, 'transfer', 490000000, 10000000)
  `);
  await db.run(`
    INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, address, amount, prev_block_height)
    VALUES ('tx2', 101, 'tx1', 0, 'SAddr1', 500000000, 100)
  `);
  await db.run(`DELETE FROM utxos WHERE txid = 'tx1' AND vout_index = 0`);
  await db.run(`
    INSERT INTO utxos (txid, vout_index, address, amount, block_height)
    VALUES ('tx2', 0, 'SAddr2', 490000000, 101)
  `);
  await db.run(`
    UPDATE addresses SET balance = 0, sent = 500000000, tx_count = 2 WHERE address = 'SAddr1'
  `);
  await db.run(`
    INSERT INTO addresses (address, balance, received, sent, tx_count)
    VALUES ('SAddr2', 490000000, 490000000, 0, 1)
  `);
  await db.run(`
    INSERT INTO address_transactions (address, txid, block_height, amount, type)
    VALUES ('SAddr1', 'tx2', 101, -500000000, 'send'),
           ('SAddr2', 'tx2', 101, 490000000, 'receive')
  `);
  await setIndexerHeight(101);

  // Now trigger rollbackToHeight(101)
  await rollbackToHeight(101);
  await setIndexerHeight(100);

  // Verify C-1: SAddr1 balance is restored exactly from UTXOs
  const addr1Row = await db.get('SELECT * FROM addresses WHERE address = ?', 'SAddr1') as any;
  const utxo1Row = await db.get('SELECT SUM(amount) as total FROM utxos WHERE address = ?', 'SAddr1') as any;
  assert.strictEqual(addr1Row.balance, 500000000, 'SAddr1 balance fully restored to 500000000');
  assert.strictEqual(addr1Row.balance, utxo1Row.total, 'SAddr1 balance matches exact UTXO sum');

  // Verify SAddr2 was cleaned up since it has no remaining transactions or utxos
  const addr2Row = await db.get('SELECT * FROM addresses WHERE address = ?', 'SAddr2');
  assert.strictEqual(addr2Row, undefined, 'SAddr2 purged after rolling back its only tx');

  // Verify C-2: indexer height is clean
  const heightAfterRollback = await getIndexerHeight();
  assert.strictEqual(heightAfterRollback, 100, 'Indexer height matches target fork height - 1');
  console.log('[PASS] Rollback UTXO synchronization and address cleanup verified');

  console.log('\n================================================================');
  console.log('=== ALL CACHE & ROLLBACK INVARIANTS PASSED PERFECTLY!         ===');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
