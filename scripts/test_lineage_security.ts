/**
 * Automated Verification Suite: PoUS Glyph Lineage Security & Squatting Prevention
 * Verifies carrier lineage tracking and authorized minter validation rules.
 */
import { initDb, db } from '../src/db/db.js';
import { saveBlockToDb } from '../src/indexer/indexer.js';

process.env.DAO_API_URL = 'none';

const GLYPH_OP = { CLAIM: 0x01, GENESIS: 0x02, TRANSFER: 0x03, BURN: 0x04 } as const;

const PROJECT = 'SMTGZc3cQVijVrcuy3awFiRm17vvk35gDa';   // .env.example minter
const ATTACK  = 'S_ATTACKER_ADDRESS';
const VICTIM  = 'S_VICTIM_COLLECTOR';

const HASH_A = 'aa'.repeat(32);
const HASH_B = 'bb'.repeat(32);

function buildGlyphOpReturnHex(opType: number, edition: number, glyphHash: string): string {
  const buf = Buffer.alloc(40);
  buf.write('QVNC', 0, 4, 'ascii');
  buf.writeUInt8(0x01, 4); // version 1
  buf.writeUInt8(opType, 5); // opType
  Buffer.from(glyphHash, 'hex').copy(buf, 6, 0, 32);
  buf.writeUInt16LE(edition, 38);
  return '6a28' + buf.toString('hex');
}

async function main() {
  await initDb(':memory:');

  let height = 100;

  async function processTxBlock(tx: {
    txid: string;
    vin: Array<{ txid: string; vout: number; address?: string }>;
    outputs: Array<{ address: string; sat: number; isOpReturn?: boolean; glyph?: { opType: number; edition: number; glyphHash: string } }>;
  }): Promise<void> {
    const h = ++height;
    // Ensure vin funding is in utxos if address is specified
    for (const input of tx.vin) {
      if (input.address) {
        await db.run(
          `INSERT OR REPLACE INTO utxos (txid, vout_index, address, amount, block_height)
           VALUES (?, ?, ?, ?, ?)`,
          input.txid, input.vout, input.address, 100000, 50
        );
      }
    }

    const vouts = tx.outputs.map((out, idx) => {
      if (out.isOpReturn && out.glyph) {
        const hex = buildGlyphOpReturnHex(out.glyph.opType, out.glyph.edition, out.glyph.glyphHash);
        return {
          value: 0,
          n: idx,
          scriptPubKey: { hex, asm: 'OP_RETURN' }
        };
      }
      return {
        value: out.sat / 1e8,
        n: idx,
        scriptPubKey: { hex: '76a914...', addresses: out.address ? [out.address] : [] }
      };
    });

    const block = {
      hash: `bh_${h}`,
      height: h,
      previous_hash: `bh_${h - 1}`,
      time: 1789000000 + h,
      tx_count: 1,
      size: 500,
      tx: [
        {
          txid: tx.txid,
          vin: tx.vin.map(v => ({ txid: v.txid, vout: v.vout, scriptSig: { hex: '' } })),
          vout: vouts
        }
      ]
    };

    await saveBlockToDb(block, h);
  }

  async function processSingleGlyph(
    txid: string,
    vin: Array<{ txid: string; vout: number; address?: string }>,
    carrierAddr: string | null,
    opType: number,
    edition: number,
    glyphHash: string
  ): Promise<boolean> {
    const outputs: Array<{ address: string; sat: number; isOpReturn?: boolean; glyph?: any }> = [];
    if (carrierAddr !== null) {
      outputs.push({ address: carrierAddr, sat: 10000 });
    }
    outputs.push({
      address: '',
      sat: 0,
      isOpReturn: true,
      glyph: { opType, edition, glyphHash }
    });

    await processTxBlock({ txid, vin, outputs });
    const row = await db.get('SELECT * FROM glyphs WHERE txid = ?', txid);
    return row !== undefined;
  }

  const results: Array<[string, boolean, string]> = [];
  const check = (name: string, pass: boolean, note: string) => {
    results.push([name, pass, note]);
    console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}\n        ${note}`);
  };

  // =====================================================================
  console.log('\n[1] Mint validation with GLYPH_MINTER_ADDRESS configured');
  process.env.GLYPH_MINTER_ADDRESS = PROJECT;

  // Squat: Attacker attempts to claim edition 1234 without minter funding
  const squat = await processSingleGlyph('squat', [{ txid: 'atk_funds_0', vout: 0, address: ATTACK }], ATTACK, 1, 1234, HASH_B);
  check('unauthorized CLAIM rejected when minter configured', squat === false,
    squat ? 'ACCEPTED - squatting still possible' : 'rejected');

  // Authorized mint: Project mints edition 7 to itself
  const authMint = await processSingleGlyph('mint1', [{ txid: 'proj_fund_tx_0', vout: 0, address: PROJECT }], PROJECT, 1, 7, HASH_A);
  check('authorized CLAIM funded by configured minter accepted', authMint === true,
    authMint ? 'ok' : 'REGRESSION: legitimate mint blocked');

  // Recipient-based attack (NEW-16): Attacker funds tx sending 10k sats to minter
  const attackerPayMinter = await processSingleGlyph('atk_pay_minter', [{ txid: 'atk_fund_tx', vout: 0, address: ATTACK }], PROJECT, 1, 99, HASH_A);
  check('unauthorized CLAIM sent to minter but funded by attacker rejected (NEW-16)', attackerPayMinter === false,
    attackerPayMinter ? 'ACCEPTED - attacker forged mint by sending to minter' : 'rejected');

  // Drop mint: configured minter funds the tx, but carrier output goes directly to recipient/collector
  const dropMint = await processSingleGlyph('drop_mint_1', [{ txid: 'proj_fund_tx_1', vout: 0, address: PROJECT }], VICTIM, 1, 21, HASH_A);
  check('authorized drop CLAIM funded by minter directly to recipient accepted', dropMint === true,
    dropMint ? 'ok' : 'REGRESSION: drop mint directly to user blocked');

  // Attacker cannot forge a drop claim to recipient if attacker funds it
  const attackerDropForged = await processSingleGlyph('atk_drop_forged', [{ txid: 'atk_fund_tx_2', vout: 0, address: ATTACK }], VICTIM, 1, 22, HASH_A);
  check('unauthorized drop CLAIM funded by attacker rejected', attackerDropForged === false,
    attackerDropForged ? 'ACCEPTED - attacker forged drop claim' : 'rejected');

  // Same edition number, DIFFERENT collection hash -> must be allowed now
  const otherCollection = await processSingleGlyph('mint2', [{ txid: 'proj_fund_tx_2', vout: 0, address: PROJECT }], PROJECT, 1, 7, HASH_B);
  check('second collection can mint the same edition number', otherCollection === true,
    otherCollection ? 'composite (hash, edition) key works' : 'editions still a global namespace');

  // glyph_hash binding on TRANSFER: attempting to transfer edition 7 with HASH_B spending mint1:0
  const hashSwap = await processSingleGlyph('swap', [{ txid: 'mint1', vout: 0 }], ATTACK, 3, 7, HASH_B);
  check('TRANSFER with a mismatched glyph_hash rejected', hashSwap === false,
    hashSwap ? 'ACCEPTED - artwork identity still swappable' : 'rejected');

  // Counterfeit transfer (does not spend the carrier)
  const counterfeit = await processSingleGlyph('forge', [{ txid: 'attacker_utxo_fake', vout: 0, address: ATTACK }], ATTACK, 3, 7, HASH_A);
  check('counterfeit TRANSFER still rejected', counterfeit === false,
    counterfeit ? 'FORGEABLE AGAIN' : 'rejected');

  // Legitimate transfer: spends mint1:0 to VICTIM
  const legit = await processSingleGlyph('xfer', [{ txid: 'mint1', vout: 0 }], VICTIM, 3, 7, HASH_A);
  check('legitimate TRANSFER accepted', legit === true,
    legit ? 'ok' : 'REGRESSION: real transfers broken');

  // BURN at the correct opcode (4): spends xfer:0
  const burn = await processSingleGlyph('burn', [{ txid: 'xfer', vout: 0 }], null, 4, 7, HASH_A);
  check('BURN at opType 4 honoured', burn === true,
    burn ? 'ok' : 'BURN opcode still misaligned');

  // =====================================================================
  console.log('\n[2] Fail-closed validation without GLYPH_MINTER_ADDRESS');
  delete process.env.GLYPH_MINTER_ADDRESS;
  delete process.env.QVNC_COLLECTION_ISSUER_ADDRESS;

  const openSquat = await processSingleGlyph('squat2', [{ txid: 'atk_fund_open', vout: 0, address: ATTACK }], ATTACK, 1, 99, HASH_B);
  check('CLAIM still rejected with no minter configured', openSquat === false,
    openSquat ? 'ACCEPTED - control is FAIL-OPEN, anyone can mint' : 'rejected');

  // front-run the project's own (hash, edition) before it mints
  const frontRun = await processSingleGlyph('frontrun', [{ txid: 'atk_fund_front', vout: 0, address: ATTACK }], ATTACK, 1, 500, HASH_A);
  const projectAfter = await processSingleGlyph('projlate', [{ txid: 'proj_fund_late', vout: 0, address: PROJECT }], PROJECT, 1, 500, HASH_A);
  check('both attacker and project CLAIMs rejected with no minter configured (fail-closed)',
    frontRun === false && projectAfter === false,
    (frontRun === false && projectAfter === false)
      ? 'fail-closed: no mints accepted without GLYPH_MINTER_ADDRESS'
      : `fail-open: attacker=${frontRun}, project=${projectAfter}`);

  // =====================================================================
  console.log('\n[3] Batched multi-glyph operations in a single transaction (NEW-18)');
  process.env.GLYPH_MINTER_ADDRESS = PROJECT;

  const batchTxid = 'batch_tx_multi_glyph';
  const batchOutputs = [
    { address: PROJECT, sat: 10000 }, // vout 0: carrier for glyph 1
    { address: '', sat: 0, isOpReturn: true, glyph: { opType: 1, edition: 100, glyphHash: HASH_A } }, // vout 1: OP_RETURN for glyph 1
    { address: VICTIM, sat: 10000 },  // vout 2: carrier for glyph 2
    { address: '', sat: 0, isOpReturn: true, glyph: { opType: 1, edition: 101, glyphHash: HASH_A } }, // vout 3: OP_RETURN for glyph 2
  ];

  await processTxBlock({
    txid: batchTxid,
    vin: [{ txid: 'proj_batch_fund', vout: 0, address: PROJECT }],
    outputs: batchOutputs,
  });

  const rowBatch1 = await db.get('SELECT * FROM glyphs WHERE txid = ? AND op_vout = 1', batchTxid);
  const rowBatch2 = await db.get('SELECT * FROM glyphs WHERE txid = ? AND op_vout = 3', batchTxid);

  check('batched glyph op #1 accepted', rowBatch1 !== undefined,
    rowBatch1 ? 'ok' : 'batched op 1 failed');

  check('batched glyph op #2 accepted in same tx', rowBatch2 !== undefined,
    rowBatch2 ? 'ok' : 'batched op 2 failed');

  // Verify compound primary key preserved both rows in DB
  const batchRows = await db.all(
    'SELECT txid, op_vout, edition, carrier_vout, carrier_address FROM glyphs WHERE txid = ? ORDER BY op_vout ASC',
    batchTxid
  );
  check('both batched glyph operations preserved in DB (compound PK txid, op_vout)',
    batchRows.length === 2,
    batchRows.length === 2 ? '2 distinct rows stored' : `COLLISION: only ${batchRows.length} row(s) stored`);

  if (batchRows.length === 2) {
    check('batched op #1 assigned to carrier vout 0',
      batchRows[0].op_vout === 1 && batchRows[0].carrier_vout === 0 && batchRows[0].edition === 100,
      `op_vout=${batchRows[0].op_vout}, carrier_vout=${batchRows[0].carrier_vout}, edition=${batchRows[0].edition}`);

    check('batched op #2 assigned to carrier vout 2 (no carrier starvation)',
      batchRows[1].op_vout === 3 && batchRows[1].carrier_vout === 2 && batchRows[1].edition === 101,
      `op_vout=${batchRows[1].op_vout}, carrier_vout=${batchRows[1].carrier_vout}, edition=${batchRows[1].edition}`);
  }

  // Carrier starvation test: 2 glyph ops but only 1 carrier output in tx
  const starvedTxid = 'batch_tx_starved';
  const starvedOutputs = [
    { address: PROJECT, sat: 10000 }, // only one carrier output at vout 0
    { address: '', sat: 0, isOpReturn: true, glyph: { opType: 1, edition: 200, glyphHash: HASH_A } }, // vout 1
    { address: '', sat: 0, isOpReturn: true, glyph: { opType: 1, edition: 201, glyphHash: HASH_A } }, // vout 2
  ];

  await processTxBlock({
    txid: starvedTxid,
    vin: [{ txid: 'proj_fund_starve', vout: 0, address: PROJECT }],
    outputs: starvedOutputs,
  });

  const starvedOp1Row = await db.get('SELECT * FROM glyphs WHERE txid = ? AND edition = 200', starvedTxid);
  const starvedOp2Row = await db.get('SELECT * FROM glyphs WHERE txid = ? AND edition = 201', starvedTxid);

  const starvedOp1 = starvedOp1Row !== undefined;
  const starvedOp2 = starvedOp2Row !== undefined;

  check('second glyph op rejected when carrier outputs are exhausted in tx',
    starvedOp1 === true && starvedOp2 === false,
    `op1=${starvedOp1}, op2=${starvedOp2}`);

  // Independent lineage transfer of both batched glyphs
  const xfer100 = await processSingleGlyph('xfer_batch_100', [{ txid: batchTxid, vout: 0 }], VICTIM, 3, 100, HASH_A);
  check('subsequent transfer of batched glyph #1 spending carrier vout 0 accepted', xfer100 === true,
    xfer100 ? 'ok' : 'transfer of glyph #1 broken');

  const xfer101 = await processSingleGlyph('xfer_batch_101', [{ txid: batchTxid, vout: 2 }], PROJECT, 3, 101, HASH_A);
  check('subsequent transfer of batched glyph #2 spending carrier vout 2 accepted', xfer101 === true,
    xfer101 ? 'ok' : 'transfer of glyph #2 broken');

  const crossTransfer = await processSingleGlyph('cross_xfer_attempt', [{ txid: batchTxid, vout: 0 }], ATTACK, 3, 101, HASH_A);
  check('cross-carrier transfer attempt for batched glyph #2 rejected', crossTransfer === false,
    crossTransfer ? 'ACCEPTED - carrier mismatch allowed' : 'rejected');

  // =====================================================================
  const failed = results.filter(([, p]) => !p);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log('\nFAILURES:');
    for (const [n, , note] of failed) console.log(`  - ${n}: ${note}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

