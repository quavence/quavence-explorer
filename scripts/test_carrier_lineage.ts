import { initDb, db } from '../src/db/db.js';
import { saveBlockToDb } from '../src/indexer/indexer.js';

process.env.DAO_API_URL = 'none';

function buildGlyphOpReturnHex(opType: number, edition: number, glyphHash: string): string {
  const buf = Buffer.alloc(40);
  buf.write('QVNC', 0, 4, 'ascii');
  buf.writeUInt8(0x01, 4); // version 1
  buf.writeUInt8(opType, 5); // opType
  Buffer.from(glyphHash, 'hex').copy(buf, 6, 0, 32);
  buf.writeUInt16LE(edition, 38);
  return '6a28' + buf.toString('hex');
}

async function runTest() {
  console.log('=== QUAVENCE EXPLORER: CARRIER LINEAGE VERIFICATION SUITE ===\n');

  // Initialize production in-memory SQLite database
  await initDb(':memory:');

  const glyphHash = 'aabbcc112233' + '00'.repeat(26); // 32 bytes hex
  const claimScript = buildGlyphOpReturnHex(1, 1, glyphHash); // CLAIM edition 1
  const transferScript = buildGlyphOpReturnHex(3, 1, glyphHash); // TRANSFER edition 1

  // Set Alice as the authorized minter for CLAIM
  process.env.GLYPH_MINTER_ADDRESS = 'address_alice';

  // Address query helper matching updated src/api/routes/address.ts
  async function getHeldGlyphs(addr: string) {
    return await db.all(
      `SELECT g.*, u.amount as carrier_amount, u.block_height as utxo_block_height
       FROM glyphs g
       JOIN utxos u ON g.txid = u.txid AND g.carrier_vout = u.vout_index
       WHERE u.address = ?
         AND g.op_label != 'BURN'
         AND g.rowid = (
           SELECT g2.rowid FROM glyphs g2
           WHERE g2.glyph_hash = g.glyph_hash AND g2.edition = g.edition
           ORDER BY g2.block_height DESC, g2.rowid DESC
           LIMIT 1
         )
       ORDER BY g.block_height DESC`,
      addr
    );
  }

  // Pre-seed funding UTXOs
  await db.run(`INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('funding_alice', 0, 'address_alice', 100000, 50)`);
  await db.run(`INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('funding_bob', 0, 'address_bob', 100000, 50)`);
  await db.run(`INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('funding_mallory', 0, 'address_mallory', 100000, 50)`);
  await db.run(`INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('some_other_funding', 0, 'address_alice', 100000, 50)`);

  // TEST CASE 1: Valid initial CLAIM of Edition #1 by Alice
  const block100 = {
    hash: 'blockhash_100',
    previousblockhash: 'blockhash_099',
    time: 1700000000,
    tx_count: 1,
    size: 500,
    tx: [
      {
        txid: 'tx_mint_alice_001',
        vin: [{ txid: 'funding_alice', vout: 0, scriptSig: { hex: '' } }],
        vout: [
          { value: 0.0001, n: 0, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: ['address_alice'] } },
          { value: 0, n: 1, scriptPubKey: { hex: claimScript, asm: 'OP_RETURN' } }
        ]
      }
    ]
  };

  await saveBlockToDb(block100, 100);
  const row1 = await db.get('SELECT * FROM glyphs WHERE txid = ?', 'tx_mint_alice_001');
  const res1 = row1 !== undefined;
  console.log('Case 1: Alice MINT/CLAIM Edition #1 -> Accepted:', res1 === true);
  if (!res1) throw new Error('Case 1 failed');

  let aliceGlyphs = await getHeldGlyphs('address_alice');
  console.log('Alice held count:', aliceGlyphs.length, '(edition:', aliceGlyphs[0]?.edition, ')');
  if (aliceGlyphs.length !== 1 || aliceGlyphs[0].edition !== 1) throw new Error('Alice does not hold glyph #1');

  // TEST CASE 2: Duplicate CLAIM attack by Bob for Edition #1
  const block101 = {
    hash: 'blockhash_101',
    previousblockhash: 'blockhash_100',
    time: 1700000010,
    tx_count: 1,
    size: 500,
    tx: [
      {
        txid: 'tx_bob_dup_claim_002',
        vin: [{ txid: 'funding_bob', vout: 0, scriptSig: { hex: '' } }],
        vout: [
          { value: 0.0001, n: 0, scriptPubKey: { hex: '76a914222222222222222222222222222222222222222288ac', addresses: ['address_bob'] } },
          { value: 0, n: 1, scriptPubKey: { hex: claimScript, asm: 'OP_RETURN' } }
        ]
      }
    ]
  };

  await saveBlockToDb(block101, 101);
  const row2 = await db.get('SELECT * FROM glyphs WHERE txid = ?', 'tx_bob_dup_claim_002');
  const res2 = row2 !== undefined;
  console.log('Case 2: Bob duplicate CLAIM attack on Edition #1 -> Blocked:', res2 === false);
  if (res2) throw new Error('Case 2 failed: duplicate CLAIM was accepted!');

  let bobGlyphs = await getHeldGlyphs('address_bob');
  console.log('Bob held count after fake claim:', bobGlyphs.length);
  if (bobGlyphs.length !== 0) throw new Error('Bob holds glyph after fake claim!');

  // TEST CASE 3: Counterfeit TRANSFER attack by Mallory (NEW-5 Exploit Vector)
  // Mallory creates a tx with OP_RETURN TRANSFER for Edition #1, but spends her OWN coins, not Alice's carrier
  const block102 = {
    hash: 'blockhash_102',
    previousblockhash: 'blockhash_101',
    time: 1700000020,
    tx_count: 1,
    size: 500,
    tx: [
      {
        txid: 'tx_mallory_counterfeit_003',
        vin: [{ txid: 'funding_mallory', vout: 0, scriptSig: { hex: '' } }], // DOES NOT SPEND Alice's carrier tx_mint_alice_001:0
        vout: [
          { value: 0.0001, n: 0, scriptPubKey: { hex: '76a914333333333333333333333333333333333333333388ac', addresses: ['address_mallory'] } },
          { value: 0, n: 1, scriptPubKey: { hex: transferScript, asm: 'OP_RETURN' } }
        ]
      }
    ]
  };

  await saveBlockToDb(block102, 102);
  const row3 = await db.get('SELECT * FROM glyphs WHERE txid = ?', 'tx_mallory_counterfeit_003');
  const res3 = row3 !== undefined;
  console.log('Case 3: Mallory counterfeit TRANSFER attack -> Blocked by Carrier Lineage:', res3 === false);
  if (res3) throw new Error('Case 3 failed: counterfeit TRANSFER was accepted!');

  let malloryGlyphs = await getHeldGlyphs('address_mallory');
  console.log('Mallory held count after attack:', malloryGlyphs.length);
  if (malloryGlyphs.length !== 0) throw new Error('Mallory holds glyph after counterfeit transfer!');

  // Alice must still be the verified holder
  aliceGlyphs = await getHeldGlyphs('address_alice');
  console.log('Alice still holds glyph #1:', aliceGlyphs.length === 1);
  if (aliceGlyphs.length !== 1) throw new Error('Alice lost glyph from counterfeit attack!');

  // TEST CASE 4: Legitimate TRANSFER from Alice to Charlie
  // Alice signs a tx that genuinely spends her carrier UTXO (tx_mint_alice_001:0)
  const block103 = {
    hash: 'blockhash_103',
    previousblockhash: 'blockhash_102',
    time: 1700000030,
    tx_count: 1,
    size: 500,
    tx: [
      {
        txid: 'tx_transfer_charlie_004',
        vin: [{ txid: 'tx_mint_alice_001', vout: 0, scriptSig: { hex: '' } }], // SPENDS ALICE'S CARRIER!
        vout: [
          { value: 0.0001, n: 0, scriptPubKey: { hex: '76a914444444444444444444444444444444444444444488ac', addresses: ['address_charlie'] } },
          { value: 0, n: 1, scriptPubKey: { hex: transferScript, asm: 'OP_RETURN' } }
        ]
      }
    ]
  };

  await saveBlockToDb(block103, 103);
  const row4 = await db.get('SELECT * FROM glyphs WHERE txid = ?', 'tx_transfer_charlie_004');
  const res4 = row4 !== undefined;
  console.log('Case 4: Legitimate TRANSFER from Alice to Charlie -> Accepted:', res4 === true);
  if (!res4) throw new Error('Case 4 failed: legitimate transfer was rejected!');

  // Now Charlie must hold it, and Alice must NOT
  aliceGlyphs = await getHeldGlyphs('address_alice');
  const charlieGlyphs = await getHeldGlyphs('address_charlie');
  console.log('Alice held count:', aliceGlyphs.length, '(expected 0)');
  console.log('Charlie held count:', charlieGlyphs.length, '(expected 1, edition:', charlieGlyphs[0]?.edition, ')');
  if (aliceGlyphs.length !== 0 || charlieGlyphs.length !== 1) throw new Error('Ownership transfer failed!');

  // TEST CASE 5: Alice attempts to transfer it AGAIN after having spent it (Replay / Double spend attempt)
  const block104 = {
    hash: 'blockhash_104',
    previousblockhash: 'blockhash_103',
    time: 1700000040,
    tx_count: 1,
    size: 500,
    tx: [
      {
        txid: 'tx_alice_replay_005',
        vin: [{ txid: 'some_other_funding', vout: 0, scriptSig: { hex: '' } }],
        vout: [
          { value: 0.0001, n: 0, scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: ['address_alice'] } },
          { value: 0, n: 1, scriptPubKey: { hex: transferScript, asm: 'OP_RETURN' } }
        ]
      }
    ]
  };

  await saveBlockToDb(block104, 104);
  const row5 = await db.get('SELECT * FROM glyphs WHERE txid = ?', 'tx_alice_replay_005');
  const res5 = row5 !== undefined;
  console.log('Case 5: Alice double-transfer attack without Charlie carrier -> Blocked:', res5 === false);
  if (res5) throw new Error('Case 5 failed: double spend transfer was accepted!');

  console.log('\n*** ALL 5 CARRIER LINEAGE & ANTI-SPOOFING TESTS PASSED PERFECTLY! ***\n');
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
