/**
 * Automated Verification Suite: PoUS Glyph Carrier Lineage & Anti-Spoofing
 *
 * Verifies that the indexer enforces carrier lineage tracking, unauthorized claim
 * rejection, and cryptographic glyph hash binding.
 */
import { initDb, db } from '../src/db/db.js';
import { saveBlockToDb } from '../src/indexer/indexer.js';

process.env.DAO_API_URL = 'none';

const PROJECT = 'S_PROJECT_OFFICIAL_MINTER';
const VICTIM  = 'S_VICTIM_COLLECTOR';
const ATTACK  = 'S_ATTACKER';

process.env.GLYPH_MINTER_ADDRESS = PROJECT;

const REAL_HASH  = 'aa'.repeat(32);
const BOGUS_HASH = 'bb'.repeat(32);

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

  // Pre-seed funding UTXOs
  await db.run(`INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('project_funds_1', 0, ?, 100000, 50)`, PROJECT);
  await db.run(`INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('project_funds_2', 0, ?, 100000, 50)`, PROJECT);
  await db.run(`INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('project_funds_3', 0, ?, 100000, 50)`, PROJECT);
  await db.run(`INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('project_funds_4', 0, ?, 100000, 50)`, PROJECT);
  await db.run(`INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('project_funds_5', 0, ?, 100000, 50)`, PROJECT);
  await db.run(`INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('attacker_utxo', 3, ?, 100000, 50)`, ATTACK);
  await db.run(`INSERT INTO utxos (txid, vout_index, address, amount, block_height) VALUES ('attacker_own_utxo', 0, ?, 100000, 50)`, ATTACK);

  async function processBlock(
    txid: string,
    vin: Array<{ txid: string; vout: number }>,
    carrierAddr: string,
    opType: number,
    edition: number,
    glyphHash: string
  ): Promise<boolean> {
    const h = ++height;
    const opHex = buildGlyphOpReturnHex(opType, edition, glyphHash);
    const block = {
      hash: `bh_${h}`,
      height: h,
      previous_hash: `bh_${h - 1}`,
      time: 1789000000 + h,
      tx_count: 1,
      size: 500,
      tx: [
        {
          txid,
          vin: vin.map(v => ({ txid: v.txid, vout: v.vout, scriptSig: { hex: '' } })),
          vout: [
            {
              value: 0.00010000,
              n: 0,
              scriptPubKey: { hex: '76a914111111111111111111111111111111111111111188ac', addresses: [carrierAddr] }
            },
            {
              value: 0,
              n: 1,
              scriptPubKey: { hex: opHex, asm: 'OP_RETURN' }
            }
          ]
        }
      ]
    };

    await saveBlockToDb(block, h);
    const row = await db.get('SELECT * FROM glyphs WHERE txid = ?', txid);
    return row !== undefined;
  }

  const results: Array<[string, boolean, string]> = [];
  const check = (name: string, pass: boolean, note: string) => {
    results.push([name, pass, note]);
    console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}\n        ${note}`);
  };

  // =====================================================================
  console.log('\n[1] Counterfeit TRANSFER rejection verification');
  // Mint edition 7 to VICTIM funded by PROJECT
  await processBlock('mint1', [{ txid: 'project_funds_1', vout: 0 }], VICTIM, 1, 7, REAL_HASH);

  // Counterfeit transfer attempt by ATTACK spending attacker_own_utxo (not carrier mint1:0)
  const counterfeit = await processBlock('forge1', [{ txid: 'attacker_own_utxo', vout: 0 }], ATTACK, 3, 7, REAL_HASH);
  check('Counterfeit TRANSFER rejected', counterfeit === false,
    counterfeit ? 'STILL FORGEABLE' : 'attacker tx that does not spend the carrier is rejected');

  const owner: any = await db.get(
    `SELECT carrier_address FROM glyphs WHERE edition = 7 ORDER BY block_height DESC, rowid DESC LIMIT 1`);
  check('Carrier ownership unchanged after forgery attempt', owner.carrier_address === VICTIM,
    `holder is ${owner.carrier_address}`);

  // Legitimate transfer: VICTIM spends carrier mint1:0 to ATTACK
  const legit = await processBlock('xfer1', [{ txid: 'mint1', vout: 0 }], ATTACK, 3, 7, REAL_HASH);
  check('legitimate TRANSFER still accepted', legit === true,
    legit ? 'spending the active carrier is honoured' : 'REGRESSION: real transfers broken');

  // =====================================================================
  console.log('\n[2] Unauthorized CLAIM rejection verification');
  // Squat attempt by ATTACK spending attacker_utxo
  const squat = await processBlock('squat1', [{ txid: 'attacker_utxo', vout: 3 }], ATTACK, 1, 1234, BOGUS_HASH);
  check('anonymous CLAIM of an unminted edition is REJECTED', squat === false,
    squat ? 'ACCEPTED - anyone can mint any edition number' : 'rejected');

  // Now the real project mints edition 1234
  const projectMint = await processBlock('projmint', [{ txid: 'project_funds_2', vout: 0 }], PROJECT, 1, 1234, REAL_HASH);
  check('project can still mint edition 1234 after squat', projectMint === true,
    projectMint ? 'ok' : 'DENIAL OF MINT: edition permanently blocked by the squatter');

  const squatted: any = await db.get(
    `SELECT carrier_address, glyph_hash FROM glyphs WHERE edition = 1234
     ORDER BY block_height DESC, rowid DESC LIMIT 1`);
  check('edition 1234 belongs to the project, not the squatter',
    squatted && squatted.carrier_address === PROJECT,
    `holder=${squatted?.carrier_address} hash=${squatted?.glyph_hash?.slice(0, 8)}...`);

  // =====================================================================
  console.log('\n[3] Glyph hash immutable binding verification');
  await processBlock('mint2', [{ txid: 'project_funds_3', vout: 0 }], VICTIM, 1, 42, REAL_HASH);

  // Attempt transfer of edition 42 with BOGUS_HASH
  const hashSwap = await processBlock('swap1', [{ txid: 'mint2', vout: 0 }], ATTACK, 3, 42, BOGUS_HASH);
  check('TRANSFER with a DIFFERENT glyph_hash is rejected', hashSwap === false,
    hashSwap ? 'ACCEPTED - the artwork identity can be swapped mid-lineage' : 'rejected');

  const swapped: any = await db.get(
    `SELECT glyph_hash FROM glyphs WHERE edition = 42 ORDER BY block_height DESC, rowid DESC LIMIT 1`);
  check('edition 42 still carries its original glyph_hash',
    swapped && swapped.glyph_hash === REAL_HASH,
    `hash is now ${swapped?.glyph_hash?.slice(0, 8)}... (original ${REAL_HASH.slice(0, 8)}...)`);

  // =====================================================================
  console.log('\n[4] Two different collections sharing an edition number');
  const colA = await processBlock('colA', [{ txid: 'project_funds_4', vout: 0 }], PROJECT, 1, 5, REAL_HASH);
  const colB = await processBlock('colB', [{ txid: 'project_funds_5', vout: 0 }], PROJECT, 1, 5, BOGUS_HASH);
  check('a second collection can mint its own edition #5', colB === true,
    colB ? 'ok' : 'editions are a single global namespace - collections collide');

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
