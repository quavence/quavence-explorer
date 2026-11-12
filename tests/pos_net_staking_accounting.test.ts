import { initDb, db, clearAllData, rebuildAddressBalances } from '../src/db/db.js';
import { saveBlockToDb } from '../src/indexer/indexer.js';
import { QUAVENCE } from '../src/config.js';

async function runPosNetStakingAccountingTests() {
  console.log('================================================================');
  console.log('=== QUAVENCE EXPLORER: POS NET STAKING ACCOUNTING SSOT SUITE ===');
  console.log('================================================================\n');

  await initDb(':memory:');
  await clearAllData();

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      if (detail) console.log(`       ${detail}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (detail) console.error(`       Failure detail: ${detail}`);
      process.exitCode = 1;
    }
  }

  // ===== Constants (all in satoshis) =====
  const COIN = QUAVENCE.coin; // 1 QVNC = 100_000_000 sat

  const STAKER_ADDR_1 = 'SQiVdQ9ku5wDUBh2QQTRESWGwsrRrTkwff';
  const STAKER_ADDR_2 = 'STAKER_SPLIT_ADDRESS_00000000001';
  const DEVFEE_ADDR   = 'ScmZ5fY111111111111111111111111111';
  const ALICE_ADDR    = 'SALICE_TRANSFER_ADDRESS_000000001';
  const BOB_ADDR      = 'SBOB_RECIPIENT_ADDRESS_00000000001';

  const STAKE1_INITIAL_SAT = Math.round(50 * COIN);     // 50 QVNC
  const STAKE_REWARD_SAT   = Math.round(0.05 * COIN);   // 0.05 QVNC per round
  const STAKE2_INITIAL_SAT = Math.round(100 * COIN);    // 100 QVNC
  const SPLIT_OUT_1_SAT    = Math.round(50.025 * COIN); // 50.025 QVNC
  const SPLIT_OUT_2_SAT    = Math.round(50.025 * COIN); // 50.025 QVNC
  const DEVFEE_SAT         = Math.round(0.05 * COIN);   // 0.05 QVNC subsidy
  const ALICE_INPUT_SAT    = Math.round(20 * COIN);     // 20 QVNC
  const BOB_PAYMENT_SAT    = Math.round(5 * COIN);      // 5 QVNC
  const ALICE_CHANGE_SAT   = Math.round(14.99 * COIN);  // 14.99 QVNC
  const MINER_FEE_SAT      = ALICE_INPUT_SAT - BOB_PAYMENT_SAT - ALICE_CHANGE_SAT; // 0.01 QVNC

  // ===== GENESIS: seed STAKER_1 with 50 QVNC via genesis coinbase =====
  const genesisBlock = {
    hash: 'blk_genesis',
    previousblockhash: null,
    time: 1700000000,
    mediantime: 1700000000,
    size: 300,
    tx_count: 1,
    difficulty: 1.0,
    tx: [
      {
        txid: 'tx_genesis_coinbase',
        vin: [{ coinbase: '04ffff001d0104' }],
        vout: [
          {
            value: STAKE1_INITIAL_SAT / COIN,
            n: 0,
            scriptPubKey: { address: STAKER_ADDR_1, hex: '76a914aaaa...' }
          }
        ]
      }
    ]
  };
  await saveBlockToDb(genesisBlock, 0);

  // ============================================================================
  // ATTACK 1: Staker Multi-Round Self-Loop Attack (Section 5, Attack 1)
  // 100 consecutive PoS blocks; UTXO accumulates each round.
  // Expected: Total Received += 100 * 0.05 QVNC, Total Sent == 0, Balance == 55 QVNC.
  // ============================================================================
  console.log('--- ATTACK 1: Staker Multi-Round Self-Loop Attack ---');

  let currentTxid  = 'tx_genesis_coinbase';
  let currentVout  = 0;
  let currentSat   = STAKE1_INITIAL_SAT; // grows with each round

  for (let round = 1; round <= 100; round++) {
    const nextTxid  = `tx_pos_round_${round}`;
    const nextSat   = currentSat + STAKE_REWARD_SAT; // accumulating balance

    const posBlock = {
      hash: `blk_pos_${round}`,
      previousblockhash: round === 1 ? 'blk_genesis' : `blk_pos_${round - 1}`,
      time: 1700000000 + round * 60,
      mediantime: 1700000000 + round * 60,
      size: 320,
      tx_count: 1,
      difficulty: { 'proof-of-stake': 1.5, 'proof-of-work': 0 },
      tx: [
        {
          txid: nextTxid,
          vin: [{ txid: currentTxid, vout: currentVout, scriptSig: { hex: '48304502...' } }],
          vout: [
            // vout[0]: empty marker (coinstake signature)
            { value: 0, n: 0, scriptPubKey: { hex: '', asm: '' } },
            // vout[1]: staker gets back stake + reward
            {
              value: nextSat / COIN,
              n: 1,
              scriptPubKey: { address: STAKER_ADDR_1, hex: '76a914aaaa...' }
            }
          ]
        }
      ]
    };

    await saveBlockToDb(posBlock, round);
    currentTxid = nextTxid;
    currentVout = 1;
    currentSat  = nextSat;
  }

  const stakerRow1 = await db.get(
    'SELECT balance, received, sent, tx_count FROM addresses WHERE address = ?',
    STAKER_ADDR_1
  ) as { balance: number; received: number; sent: number; tx_count: number } | undefined;

  const expectedReceivedSat1 = STAKE1_INITIAL_SAT + 100 * STAKE_REWARD_SAT;
  const expectedSentSat1     = 0;
  const expectedBalanceSat1  = expectedReceivedSat1; // since sent = 0

  assert(stakerRow1 !== undefined, 'Staker address exists in database after 100 PoS rounds');
  assert(
    stakerRow1!.sent === expectedSentSat1,
    'Attack 1 Anti-Inflation: Total Sent is strictly 0.00 QVNC (Zero Principal Sent Inflation)',
    `Actual Sent: ${stakerRow1!.sent} sat, Expected: 0 sat (prevented ${100 * STAKE1_INITIAL_SAT / COIN} QVNC synthetic churn)`
  );
  assert(
    stakerRow1!.received === expectedReceivedSat1,
    'Attack 1 Net Staking Rewards: Total Received reflects ONLY net rewards (55.00 QVNC, not 5 055 QVNC)',
    `Actual Received: ${stakerRow1!.received} sat, Expected: ${expectedReceivedSat1} sat`
  );
  assert(
    stakerRow1!.balance === expectedBalanceSat1,
    'Attack 1 Balance Exactness: Current balance is strictly 55.00 QVNC',
    `Actual Balance: ${stakerRow1!.balance} sat, Expected: ${expectedBalanceSat1} sat`
  );
  assert(
    stakerRow1!.balance === stakerRow1!.received - stakerRow1!.sent,
    'Attack 1 Invariant 1: Mathematical equality balance === received - sent holds perfectly',
    `${stakerRow1!.balance} === ${stakerRow1!.received} - ${stakerRow1!.sent}`
  );

  // ============================================================================
  // ATTACK 2: Split Staking Output & DevFee Subsidy Parity Attack (Section 5, Attack 2)
  // Seed STAKER_2 via PoW coinbase, then PoS split block with 3 beneficiaries.
  // ============================================================================
  console.log('\n--- ATTACK 2: Split Staking Output & DevFee Subsidy Parity Attack ---');

  // Height 101: PoW block to seed STAKER_ADDR_2 with 100 QVNC
  const seedBlock2 = {
    hash: 'blk_seed_staker2',
    previousblockhash: 'blk_pos_100',
    time: 1700010000,
    mediantime: 1700010000,
    size: 300,
    tx_count: 1,
    difficulty: { 'proof-of-stake': 0, 'proof-of-work': 2.0 },
    tx: [
      {
        txid: 'tx_staker2_coinbase',
        vin: [{ coinbase: '03650100' }],
        vout: [
          {
            value: STAKE2_INITIAL_SAT / COIN,
            n: 0,
            scriptPubKey: { address: STAKER_ADDR_2, hex: '76a914bbbb...' }
          }
        ]
      }
    ]
  };
  await saveBlockToDb(seedBlock2, 101);

  // Height 102: PoS split block — spends STAKER_2's UTXO; two outputs back to staker + devfee
  const splitPosBlock = {
    hash: 'blk_pos_split_102',
    previousblockhash: 'blk_seed_staker2',
    time: 1700010060,
    mediantime: 1700010060,
    size: 450,
    tx_count: 1,
    difficulty: { 'proof-of-stake': 2.0, 'proof-of-work': 0 },
    tx: [
      {
        txid: 'tx_pos_split_stake',
        vin: [{ txid: 'tx_staker2_coinbase', vout: 0, scriptSig: { hex: '483045...' } }],
        vout: [
          { value: 0, n: 0, scriptPubKey: { hex: '', asm: '' } },
          {
            value: SPLIT_OUT_1_SAT / COIN,
            n: 1,
            scriptPubKey: { address: STAKER_ADDR_2, hex: '76a914bbbb...' }
          },
          {
            value: SPLIT_OUT_2_SAT / COIN,
            n: 2,
            scriptPubKey: { address: STAKER_ADDR_2, hex: '76a914bbbb...' }
          },
          {
            value: DEVFEE_SAT / COIN,
            n: 3,
            scriptPubKey: { address: DEVFEE_ADDR, hex: '76a914cccc...' }
          }
        ]
      }
    ]
  };
  await saveBlockToDb(splitPosBlock, 102);

  const stakerRow2 = await db.get(
    'SELECT balance, received, sent FROM addresses WHERE address = ?',
    STAKER_ADDR_2
  ) as { balance: number; received: number; sent: number } | undefined;
  const devFeeRow = await db.get(
    'SELECT balance, received, sent FROM addresses WHERE address = ?',
    DEVFEE_ADDR
  ) as { balance: number; received: number; sent: number } | undefined;

  // Net staker reward = (SPLIT_OUT_1 + SPLIT_OUT_2) - STAKE2_INITIAL
  const expectedStakerNetSat = SPLIT_OUT_1_SAT + SPLIT_OUT_2_SAT - STAKE2_INITIAL_SAT;

  assert(
    stakerRow2 !== undefined && stakerRow2.sent === 0,
    'Attack 2 Staker Sent: Staker sent counter is strictly 0 (no principal inflation despite 2 outputs)',
    `Actual Sent: ${stakerRow2?.sent}`
  );
  assert(
    stakerRow2!.received === STAKE2_INITIAL_SAT + expectedStakerNetSat,
    'Attack 2 Staker Received: Staker received increased strictly by net 0.05 QVNC',
    `Actual: ${stakerRow2!.received}, Expected: ${STAKE2_INITIAL_SAT + expectedStakerNetSat}`
  );
  assert(
    stakerRow2!.balance === STAKE2_INITIAL_SAT + expectedStakerNetSat,
    'Attack 2 Staker Balance: Staker balance increased by 0.05 QVNC',
    `Actual: ${stakerRow2!.balance}, Expected: ${STAKE2_INITIAL_SAT + expectedStakerNetSat}`
  );
  assert(
    stakerRow2!.balance === stakerRow2!.received - stakerRow2!.sent,
    'Attack 2 Invariant 1 (Staker): balance === received - sent holds',
    `${stakerRow2!.balance} === ${stakerRow2!.received} - ${stakerRow2!.sent}`
  );
  assert(
    devFeeRow !== undefined && devFeeRow.sent === 0,
    'Attack 2 DevFee Sent: DevFee sent counter is strictly 0',
    `Actual Sent: ${devFeeRow?.sent}`
  );
  assert(
    devFeeRow!.received === DEVFEE_SAT,
    'Attack 2 DevFee Subsidy: DevFee received is strictly 0.05 QVNC (100% pure subsidy)',
    `Actual Received: ${devFeeRow!.received}, Expected: ${DEVFEE_SAT}`
  );
  assert(
    devFeeRow!.balance === DEVFEE_SAT,
    'Attack 2 DevFee Balance: DevFee balance is strictly 0.05 QVNC',
    `Actual Balance: ${devFeeRow!.balance}, Expected: ${DEVFEE_SAT}`
  );
  assert(
    devFeeRow!.balance === devFeeRow!.received - devFeeRow!.sent,
    'Attack 2 Invariant 1 (DevFee): balance === received - sent holds',
    `${devFeeRow!.balance} === ${devFeeRow!.received} - ${devFeeRow!.sent}`
  );

  // ============================================================================
  // ATTACK 3: Normal Transfer Change Re-entrancy Attack (Section 5, Attack 3)
  // Seed ALICE via coinbase; she sends 5 QVNC to Bob, 14.99 QVNC change back, 0.01 fee.
  // ============================================================================
  console.log('\n--- ATTACK 3: Normal Transfer Change Re-entrancy Attack ---');

  // Height 103: PoW coinbase seeds ALICE with 20 QVNC
  const seedBlockAlice = {
    hash: 'blk_seed_alice',
    previousblockhash: 'blk_pos_split_102',
    time: 1700020000,
    mediantime: 1700020000,
    size: 300,
    tx_count: 1,
    difficulty: { 'proof-of-stake': 0, 'proof-of-work': 2.0 },
    tx: [
      {
        txid: 'tx_alice_coinbase',
        vin: [{ coinbase: '03670100' }],
        vout: [
          {
            value: ALICE_INPUT_SAT / COIN,
            n: 0,
            scriptPubKey: { address: ALICE_ADDR, hex: '76a914dddd...' }
          }
        ]
      }
    ]
  };
  await saveBlockToDb(seedBlockAlice, 103);

  // Height 104: Normal transfer — Alice → Bob (5 QVNC) + change → Alice (14.99 QVNC)
  const transferBlock = {
    hash: 'blk_transfer_104',
    previousblockhash: 'blk_seed_alice',
    time: 1700020060,
    mediantime: 1700020060,
    size: 400,
    tx_count: 1,
    difficulty: { 'proof-of-stake': 0, 'proof-of-work': 2.0 },
    tx: [
      {
        txid: 'tx_alice_to_bob',
        vin: [{ txid: 'tx_alice_coinbase', vout: 0, scriptSig: { hex: '483045...' } }],
        vout: [
          {
            value: BOB_PAYMENT_SAT / COIN,
            n: 0,
            scriptPubKey: { address: BOB_ADDR, hex: '76a914eeee...' }
          },
          {
            value: ALICE_CHANGE_SAT / COIN,
            n: 1,
            scriptPubKey: { address: ALICE_ADDR, hex: '76a914dddd...' }
          }
        ]
      }
    ]
  };
  await saveBlockToDb(transferBlock, 104);

  const aliceRow = await db.get(
    'SELECT balance, received, sent FROM addresses WHERE address = ?',
    ALICE_ADDR
  ) as { balance: number; received: number; sent: number } | undefined;
  const bobRow = await db.get(
    'SELECT balance, received, sent FROM addresses WHERE address = ?',
    BOB_ADDR
  ) as { balance: number; received: number; sent: number } | undefined;
  const transferTxRow = await db.get(
    'SELECT type, fee, amount_raw_output, amount_net_transfer, change_amount FROM transactions WHERE txid = ?',
    'tx_alice_to_bob'
  ) as any;

  assert(
    transferTxRow?.type === 'normal_transfer',
    'Attack 3 Isolation: Normal transfer correctly classified as "normal_transfer" (not stake_reward)',
    `tx_type: ${transferTxRow?.type}`
  );
  assert(
    transferTxRow?.amount_net_transfer === BOB_PAYMENT_SAT,
    'Attack 3 Net Transfer: Net transfer recognized as 5.00 QVNC',
    `Actual: ${transferTxRow?.amount_net_transfer}, Expected: ${BOB_PAYMENT_SAT}`
  );
  assert(
    transferTxRow?.change_amount === ALICE_CHANGE_SAT,
    'Attack 3 Change Isolation: Change amount correctly recognized as 14.99 QVNC',
    `Actual: ${transferTxRow?.change_amount}, Expected: ${ALICE_CHANGE_SAT}`
  );
  // Normal transfer: full gross accounting (not affected by PoS netting)
  assert(
    aliceRow!.sent === ALICE_INPUT_SAT,
    'Attack 3 Normal Transfer Sent: Alice sent counter increases by full input 20 QVNC (gross)',
    `Actual Sent: ${aliceRow!.sent}, Expected: ${ALICE_INPUT_SAT}`
  );
  assert(
    aliceRow!.received === ALICE_INPUT_SAT + ALICE_CHANGE_SAT,
    'Attack 3 Normal Transfer Received: Alice received counter = initial + change',
    `Actual Received: ${aliceRow!.received}, Expected: ${ALICE_INPUT_SAT + ALICE_CHANGE_SAT}`
  );
  assert(
    aliceRow!.balance === ALICE_CHANGE_SAT,
    'Attack 3 Alice Balance: Alice balance = 14.99 QVNC (net spend = 5.01 QVNC)',
    `Actual Balance: ${aliceRow!.balance}, Expected: ${ALICE_CHANGE_SAT}`
  );
  assert(
    aliceRow!.balance === aliceRow!.received - aliceRow!.sent,
    'Attack 3 Invariant 1 (Alice): balance === received - sent holds',
    `${aliceRow!.balance} === ${aliceRow!.received} - ${aliceRow!.sent}`
  );
  assert(
    bobRow!.received === BOB_PAYMENT_SAT && bobRow!.sent === 0,
    'Attack 3 Bob Accounting: received = 5 QVNC, sent = 0',
    `Received: ${bobRow!.received}, Sent: ${bobRow!.sent}`
  );
  assert(
    bobRow!.balance === BOB_PAYMENT_SAT,
    'Attack 3 Bob Balance: Bob balance is strictly 5.00 QVNC',
    `Actual: ${bobRow!.balance}, Expected: ${BOB_PAYMENT_SAT}`
  );

  // ============================================================================
  // ATTACK 4: Rebuild Idempotency & Mathematical Invariant Audit
  // rebuildAddressBalances() reads address_transactions (fully populated via saveBlockToDb)
  // and must produce bit-exact results matching online indexing.
  // ============================================================================
  console.log('\n--- ATTACK 4: Rebuild Idempotency & Mathematical Invariant Audit ---');

  const addressesBefore = await db.all(
    'SELECT address, balance, received, sent, tx_count FROM addresses ORDER BY address ASC'
  ) as { address: string; balance: number; received: number; sent: number; tx_count: number }[];

  await rebuildAddressBalances();

  const addressesAfter = await db.all(
    'SELECT address, balance, received, sent, tx_count FROM addresses ORDER BY address ASC'
  ) as { address: string; balance: number; received: number; sent: number; tx_count: number }[];

  assert(
    addressesAfter.length === addressesBefore.length,
    'Attack 4 Rebuild Parity: Address count matches before and after rebuildAddressBalances()',
    `Count: ${addressesAfter.length}`
  );

  let parityViolations = 0;
  let invariantViolations = 0;

  for (const a of addressesAfter) {
    const b = addressesBefore.find((r) => r.address === a.address);
    if (!b) {
      parityViolations++;
      console.error(`[MISMATCH] Address ${a.address} not found in before-state`);
      continue;
    }

    if (b.balance !== a.balance || b.received !== a.received || b.sent !== a.sent) {
      parityViolations++;
      console.error(
        `[MISMATCH] Address ${a.address}:` +
        ` before=[bal:${b.balance}, rec:${b.received}, sent:${b.sent}]` +
        ` after=[bal:${a.balance}, rec:${a.received}, sent:${a.sent}]`
      );
    }

    if (a.balance !== a.received - a.sent) {
      invariantViolations++;
      console.error(
        `[INVARIANT VIOLATION] Address ${a.address}: balance (${a.balance}) !== received (${a.received}) - sent (${a.sent})`
      );
    }
  }

  assert(
    parityViolations === 0,
    'Attack 4 Bit-Exact Parity: 0 mismatches between online indexing and offline rebuild',
    `Violations: ${parityViolations}`
  );
  assert(
    invariantViolations === 0,
    'Attack 4 Universal Mathematical Invariant: balance === received - sent holds across 100% of addresses',
    `Violations: ${invariantViolations}`
  );

  console.log(`\n================================================================`);
  console.log(`=== ALL POS NET STAKING ACCOUNTING TESTS PASSED (${passed}/${total}) ===`);
  console.log(`================================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runPosNetStakingAccountingTests().catch((err) => {
  console.error('[FATAL] Test failed with uncaught exception:', err);
  process.exit(1);
});
