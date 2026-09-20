import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTest() {
  console.log('=== TEST: PoUS Glyph Carrier Lineage & Anti-Spoofing (NEW-5) ===\n');

  // Use an in-memory SQLite database
  const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database
  });

  const schemaPath = path.resolve(__dirname, '../src/db/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(schema);

  // Helper to emulate the indexer's glyph verification logic
  async function processGlyphTx(tx: {
    txid: string;
    hash: string;
    height: number;
    time: number;
    vin: Array<{ txid: string; vout: number }>;
    vout: Array<{ value: number; scriptPubKey: { hex?: string; addresses?: string[] } }>;
    glyph: {
      opLabel: 'CLAIM' | 'TRANSFER' | 'BURN';
      opType: number;
      edition: number;
      glyphHash: string;
    };
  }) {
    const { txid, height, glyph } = tx;
    let isValidGlyphOp = false;

    // Query active carrier record for this edition
    const activeCarrier = await db.get(
      `SELECT txid, carrier_vout, carrier_address, op_label, glyph_hash
       FROM glyphs
       WHERE edition = ?
       ORDER BY block_height DESC, rowid DESC
       LIMIT 1`,
      glyph.edition
    );

    if (glyph.opLabel === 'CLAIM' || glyph.opType === 1) {
      if (activeCarrier) {
        // REJECT duplicate claim
        isValidGlyphOp = false;
      } else {
        isValidGlyphOp = true;
      }
    } else if (glyph.opLabel === 'TRANSFER' || glyph.opType === 3) {
      if (!activeCarrier || activeCarrier.op_label === 'BURN') {
        isValidGlyphOp = false;
      } else {
        const spendsActiveCarrier = (tx.vin || []).some((input: any) =>
          input.txid === activeCarrier.txid && Number(input.vout) === Number(activeCarrier.carrier_vout)
        );
        isValidGlyphOp = spendsActiveCarrier;
      }
    } else if (glyph.opLabel === 'BURN' || glyph.opType === 2) {
      if (!activeCarrier || activeCarrier.op_label === 'BURN') {
        isValidGlyphOp = false;
      } else {
        const spendsActiveCarrier = (tx.vin || []).some((input: any) =>
          input.txid === activeCarrier.txid && Number(input.vout) === Number(activeCarrier.carrier_vout)
        );
        isValidGlyphOp = spendsActiveCarrier;
      }
    }

    if (isValidGlyphOp) {
      let carrierVout = 0;
      let carrierAddress: string | null = null;

      if (glyph.opLabel === 'BURN' || glyph.opType === 2) {
        carrierAddress = null;
        carrierVout = 0;
      } else {
        for (let cIdx = 0; cIdx < tx.vout.length; cIdx++) {
          const cOut = tx.vout[cIdx];
          const cSat = Math.round(cOut.value * 1e8);
          const cAddr = cOut.scriptPubKey.addresses?.[0] || null;
          if (cSat === 10000 && cAddr) {
            carrierVout = cIdx;
            carrierAddress = cAddr;
            break;
          }
          if (cSat > 0 && cAddr && !carrierAddress) {
            carrierVout = cIdx;
            carrierAddress = cAddr;
          }
        }
      }

      await db.run(
        `INSERT OR REPLACE INTO glyphs (
           txid, block_hash, block_height, block_time, glyph_hash,
           edition, op_type, op_label, carrier_address, carrier_vout
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        txid, tx.hash, height, tx.time,
        glyph.glyphHash, glyph.edition, glyph.opType, glyph.opLabel,
        carrierAddress, carrierVout
      );

      // Add carrier output to utxos
      if (carrierAddress) {
        await db.run(
          `INSERT INTO utxos (txid, vout_index, address, amount, block_height)
           VALUES (?, ?, ?, ?, ?)`,
          txid, carrierVout, carrierAddress, 10000, height
        );
      }

      // Spend inputs from utxos
      for (const vin of tx.vin) {
        await db.run('DELETE FROM utxos WHERE txid = ? AND vout_index = ?', vin.txid, vin.vout);
      }
    }

    return isValidGlyphOp;
  }

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
           WHERE g2.edition = g.edition
           ORDER BY g2.block_height DESC, g2.rowid DESC
           LIMIT 1
         )
       ORDER BY g.block_height DESC`,
      addr
    );
  }

  // TEST CASE 1: Valid initial CLAIM of Edition #1 by Alice
  const tx1AliceMint = {
    txid: 'tx_mint_alice_001',
    hash: 'blockhash_100',
    height: 100,
    time: 1700000000,
    vin: [{ txid: 'funding_alice', vout: 0 }],
    vout: [
      { value: 0.0001, scriptPubKey: { addresses: ['address_alice'] } }, // Out 0: Carrier
      { value: 0, scriptPubKey: { hex: '6a2851564e430101...' } }       // Out 1: OP_RETURN
    ],
    glyph: {
      opLabel: 'CLAIM' as const,
      opType: 1,
      edition: 1,
      glyphHash: 'aabbcc112233',
    }
  };

  const res1 = await processGlyphTx(tx1AliceMint);
  console.log('Case 1: Alice MINT/CLAIM Edition #1 -> Accepted:', res1 === true);
  if (!res1) throw new Error('Case 1 failed');

  let aliceGlyphs = await getHeldGlyphs('address_alice');
  console.log('Alice held count:', aliceGlyphs.length, '(edition:', aliceGlyphs[0]?.edition, ')');
  if (aliceGlyphs.length !== 1 || aliceGlyphs[0].edition !== 1) throw new Error('Alice does not hold glyph #1');

  // TEST CASE 2: Duplicate CLAIM attack by Bob for Edition #1
  const tx2BobDupClaim = {
    txid: 'tx_bob_dup_claim_002',
    hash: 'blockhash_101',
    height: 101,
    time: 1700000010,
    vin: [{ txid: 'funding_bob', vout: 0 }],
    vout: [
      { value: 0.0001, scriptPubKey: { addresses: ['address_bob'] } },
      { value: 0, scriptPubKey: { hex: '6a2851564e430101...' } }
    ],
    glyph: {
      opLabel: 'CLAIM' as const,
      opType: 1,
      edition: 1,
      glyphHash: 'aabbcc112233',
    }
  };

  const res2 = await processGlyphTx(tx2BobDupClaim);
  console.log('Case 2: Bob duplicate CLAIM attack on Edition #1 -> Blocked:', res2 === false);
  if (res2) throw new Error('Case 2 failed: duplicate CLAIM was accepted!');

  let bobGlyphs = await getHeldGlyphs('address_bob');
  console.log('Bob held count after fake claim:', bobGlyphs.length);
  if (bobGlyphs.length !== 0) throw new Error('Bob holds glyph after fake claim!');

  // TEST CASE 3: Counterfeit TRANSFER attack by Mallory (NEW-5 Exploit Vector)
  // Mallory creates a tx with OP_RETURN TRANSFER for Edition #1, but spends her OWN coins, not Alice's carrier
  const tx3MalloryCounterfeit = {
    txid: 'tx_mallory_counterfeit_003',
    hash: 'blockhash_102',
    height: 102,
    time: 1700000020,
    vin: [{ txid: 'funding_mallory', vout: 0 }], // DOES NOT SPEND Alice's carrier tx_mint_alice_001:0
    vout: [
      { value: 0.0001, scriptPubKey: { addresses: ['address_mallory'] } }, // Carrier to Mallory
      { value: 0, scriptPubKey: { hex: '6a2851564e430103...' } }           // OP_RETURN TRANSFER
    ],
    glyph: {
      opLabel: 'TRANSFER' as const,
      opType: 3,
      edition: 1,
      glyphHash: 'aabbcc112233',
    }
  };

  const res3 = await processGlyphTx(tx3MalloryCounterfeit);
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
  const tx4LegitTransfer = {
    txid: 'tx_transfer_charlie_004',
    hash: 'blockhash_103',
    height: 103,
    time: 1700000030,
    vin: [{ txid: 'tx_mint_alice_001', vout: 0 }], // SPENDS ALICE'S CARRIER!
    vout: [
      { value: 0.0001, scriptPubKey: { addresses: ['address_charlie'] } }, // New carrier to Charlie
      { value: 0, scriptPubKey: { hex: '6a2851564e430103...' } }           // OP_RETURN TRANSFER
    ],
    glyph: {
      opLabel: 'TRANSFER' as const,
      opType: 3,
      edition: 1,
      glyphHash: 'aabbcc112233',
    }
  };

  const res4 = await processGlyphTx(tx4LegitTransfer);
  console.log('Case 4: Legitimate TRANSFER from Alice to Charlie -> Accepted:', res4 === true);
  if (!res4) throw new Error('Case 4 failed: legitimate transfer was rejected!');

  // Now Charlie must hold it, and Alice must NOT
  aliceGlyphs = await getHeldGlyphs('address_alice');
  const charlieGlyphs = await getHeldGlyphs('address_charlie');
  console.log('Alice held count:', aliceGlyphs.length, '(expected 0)');
  console.log('Charlie held count:', charlieGlyphs.length, '(expected 1, edition:', charlieGlyphs[0]?.edition, ')');
  if (aliceGlyphs.length !== 0 || charlieGlyphs.length !== 1) throw new Error('Ownership transfer failed!');

  // TEST CASE 5: Alice attempts to transfer it AGAIN after having spent it (Replay / Double spend attempt)
  const tx5AliceDoubleSpend = {
    txid: 'tx_alice_replay_005',
    hash: 'blockhash_104',
    height: 104,
    time: 1700000040,
    vin: [{ txid: 'some_other_funding', vout: 0 }],
    vout: [
      { value: 0.0001, scriptPubKey: { addresses: ['address_alice'] } },
      { value: 0, scriptPubKey: { hex: '6a2851564e430103...' } }
    ],
    glyph: {
      opLabel: 'TRANSFER' as const,
      opType: 3,
      edition: 1,
      glyphHash: 'aabbcc112233',
    }
  };

  const res5 = await processGlyphTx(tx5AliceDoubleSpend);
  console.log('Case 5: Alice double-transfer attack without Charlie carrier -> Blocked:', res5 === false);
  if (res5) throw new Error('Case 5 failed: double spend transfer was accepted!');

  console.log('\n*** ALL 5 CARRIER LINEAGE & ANTI-SPOOFING TESTS PASSED PERFECTLY! ***\n');
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
