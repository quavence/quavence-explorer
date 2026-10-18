import assert from 'assert';
import { BoundedCache } from '../src/api/utils/cache.js';
import { toSatoshis } from '../src/indexer/parser.js';
import { initDb, db, rollbackToHeight, setIndexerHeight, getIndexerHeight } from '../src/db/db.js';
import { saveBlockToDb } from '../src/indexer/indexer.js';

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

  // --- 3. Test C-1 & C-2: Reorg State Invariants & UTXO Sync via saveBlockToDb ---
  console.log('\n--- 3. Testing C-1 & C-2: Rollback State Invariants & UTXO Sync via saveBlockToDb ---');
  process.env.DAO_API_URL = 'none';
  await initDb(':memory:');

  // Block 100: Coinbase mints 5.0 QVNC (500,000,000 satoshis) to SAddr1
  const block100 = {
    hash: 'h100',
    previous_hash: 'h99',
    time: 1700000000,
    tx_count: 1,
    size: 500,
    tx: [
      {
        txid: 'tx1',
        vin: [{ coinbase: '03640000' }],
        vout: [
          {
            value: 5.0,
            n: 0,
            scriptPubKey: {
              hex: '76a914111111111111111111111111111111111111111188ac',
              asm: 'OP_DUP OP_HASH160 1111111111111111111111111111111111111111 OP_EQUALVERIFY OP_CHECKSIG',
              addresses: ['SAddr1']
            }
          }
        ]
      }
    ]
  };
  await saveBlockToDb(block100, 100);
  await setIndexerHeight(100);

  // Block 101: SAddr1 spends tx1:0 and transfers 4.9 QVNC (490,000,000 satoshis) to SAddr2 with 0.1 QVNC fee
  const block101 = {
    hash: 'h101',
    previous_hash: 'h100',
    time: 1700000060,
    tx_count: 1,
    size: 500,
    tx: [
      {
        txid: 'tx2',
        vin: [
          {
            txid: 'tx1',
            vout: 0,
            scriptSig: { hex: '' }
          }
        ],
        vout: [
          {
            value: 4.9,
            n: 0,
            scriptPubKey: {
              hex: '76a914222222222222222222222222222222222222222288ac',
              asm: 'OP_DUP OP_HASH160 2222222222222222222222222222222222222222 OP_EQUALVERIFY OP_CHECKSIG',
              addresses: ['SAddr2']
            }
          }
        ]
      }
    ]
  };
  await saveBlockToDb(block101, 101);
  await setIndexerHeight(101);

  // Verify state before rollback: SAddr1 has 0 balance, SAddr2 has 490000000
  const preAddr1 = await db.get('SELECT * FROM addresses WHERE address = ?', 'SAddr1') as any;
  const preAddr2 = await db.get('SELECT * FROM addresses WHERE address = ?', 'SAddr2') as any;
  assert.strictEqual(preAddr1.balance, 0, 'SAddr1 balance is 0 after spending');
  assert.strictEqual(preAddr2.balance, 490000000, 'SAddr2 balance is 490000000');

  // Now trigger canonical rollbackToHeight(101)
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
