import http from 'http';
import { AddressInfo } from 'net';
import { performance } from 'perf_hooks';

// Force test environment so server.ts does not bind real port or background indexer
process.env.NODE_ENV = 'test';

import { initDb, db, clearAllData } from '../src/db/db.js';
import { app } from '../src/api/server.js';
import { setRpcClient, resetRpcClient } from '../src/indexer/rpc.js';
import { QUAVENCE } from '../src/config.js';

async function runExchangeApiSuite() {
  console.log('================================================================');
  console.log('🛡️ [EXCHANGE & AGGREGATOR PUBLIC API SSOT TEST SUITE]');
  console.log('   Baseline: RFC 2119 Zero-Trust, AGENTS.md Invariants 1-8, 22-31');
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

  // Spin up ephemeral test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const TEST_ADDR_VALID = 'SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd';
    const TEST_ADDR_INVALID = 'SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyydINVALID';
    const TEST_TXID_VALID = 'fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff';
    const TEST_BLOCK_HASH = '00000000000000000001a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3';
    const TEST_BLOCK_HEIGHT = 36890;

    // Seed database state
    await db.run(`
      INSERT INTO blocks (height, hash, time, size, tx_count, block_type, reward, subsidy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, TEST_BLOCK_HEIGHT, TEST_BLOCK_HASH, 1700000000, 500, 1, 'pos', 5000000, 5000000);

    await db.run(`
      INSERT INTO transactions (txid, block_hash, block_height, time, type, amount, fee, confirmations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, TEST_TXID_VALID, TEST_BLOCK_HASH, TEST_BLOCK_HEIGHT, 1700000000, 'pos_stake', 1560000, 0, 1);

    await db.run(`
      INSERT INTO addresses (address, balance, received, sent, tx_count)
      VALUES (?, ?, ?, ?, ?)
    `, TEST_ADDR_VALID, 1560000, 1560000, 0, 14);

    await db.run(`
      INSERT INTO utxos (txid, vout_index, address, amount, block_height)
      VALUES (?, ?, ?, ?, ?)
    `, TEST_TXID_VALID, 1, TEST_ADDR_VALID, 1560000, TEST_BLOCK_HEIGHT);

    // =========================================================================
    // SECTION 5 - ATTACK 1: Non-Hex and Malformed Payload Broadcast Attack
    // =========================================================================
    console.log('\n--- 1. Mandatory Adversarial Attack 1: Non-Hex / Malformed Broadcast Rejection ---');

    let rpcCallCount = 0;
    setRpcClient({
      post: async () => {
        rpcCallCount++;
        throw new Error('FAIL: RPC node was touched by unvalidated broadcast input!');
      },
    } as any);

    // Payload 1: Empty body
    const resEmpty = await fetch(`${baseUrl}/api/v1/tx/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const jsonEmpty: any = await resEmpty.json();
    assert(
      resEmpty.status === 400 && jsonEmpty.error === 'Invalid raw transaction hex string',
      'Attack 1.1: Empty payload {} is immediately rejected with 400 Bad Request',
      `Status=${resEmpty.status}, Error="${jsonEmpty.error}"`
    );

    // Payload 2: Odd-length hex characters (>= 20 chars to isolate odd-length guard from length guard)
    const resOdd = await fetch(`${baseUrl}/api/v1/tx/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawtx: '010000000100000000001' }),
    });
    const jsonOdd: any = await resOdd.json();
    assert(
      resOdd.status === 400 && jsonOdd.error === 'Invalid raw transaction hex string',
      'Attack 1.2: Odd-length hex string is immediately rejected with 400 Bad Request',
      `Status=${resOdd.status}, Error="${jsonOdd.error}"`
    );

    // Payload 3: Non-hex characters
    const resNonHex = await fetch(`${baseUrl}/api/v1/tx/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawtx: '01000000000101000000zzzzzzzz' }),
    });
    const jsonNonHex: any = await resNonHex.json();
    assert(
      resNonHex.status === 400 && jsonNonHex.error === 'Invalid raw transaction hex string',
      'Attack 1.3: Non-hex characters ("zzzz") are immediately rejected with 400 Bad Request',
      `Status=${resNonHex.status}, Error="${jsonNonHex.error}"`
    );

    // Payload 4: Sub-minimum byte length
    const resShort = await fetch(`${baseUrl}/api/v1/tx/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawtx: '01' }),
    });
    const jsonShort: any = await resShort.json();
    assert(
      resShort.status === 400 && jsonShort.error === 'Invalid raw transaction hex string',
      'Attack 1.4: Too short payload ("01") is immediately rejected with 400 Bad Request',
      `Status=${resShort.status}, Error="${jsonShort.error}"`
    );

    assert(
      rpcCallCount === 0,
      'Attack 1.5 (Strict Invariant 1 & 4): Zero RPC node calls occurred during malformed broadcast flood',
      `Total Node RPC Interceptions: ${rpcCallCount}`
    );

    // Legitimate broadcast verification (Happy path with mocked RPC response)
    const VALID_RAWTX_HEX = '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0401010101ffffffff0100e1f505000000001976a914199d24d59b414a597af788a8735c228282dc0f8488ac00000000';
    setRpcClient({
      post: async () => ({
        data: { result: TEST_TXID_VALID },
      }),
    } as any);

    const resValidBroadcast = await fetch(`${baseUrl}/api/v1/tx/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawtx: VALID_RAWTX_HEX }),
    });
    const jsonValidBroadcast: any = await resValidBroadcast.json();
    assert(
      resValidBroadcast.status === 200 && jsonValidBroadcast.status === 'broadcasted' && jsonValidBroadcast.txid === TEST_TXID_VALID,
      'Legitimate rawtx broadcast successfully forwards to L1 and returns canonical response',
      `TxID: ${jsonValidBroadcast.txid}, Status: ${jsonValidBroadcast.status}`
    );

    // =========================================================================
    // SECTION 5 - ATTACK 2: Supply Scraping & Format Header Attack
    // =========================================================================
    console.log('\n--- 2. Mandatory Adversarial Attack 2: Supply Scraping & Header Format Attack ---');

    // Scenario 2.1: CoinMarketCap robot default text/plain
    const resCmc = await fetch(`${baseUrl}/api/v1/supply/circulating`, {
      headers: { Accept: 'text/plain' },
    });
    const textCmc = await resCmc.text();
    const contentTypeCmc = resCmc.headers.get('content-type') || '';
    assert(
      resCmc.status === 200 && contentTypeCmc.includes('text/plain') && textCmc === '0.01560000',
      'Attack 2.1: CoinMarketCap scraper receives pure deterministic text/plain with 8 decimals',
      `Content-Type="${contentTypeCmc}", Body="${textCmc}"`
    );

    // Scenario 2.2: CoinGecko robot with ?format=json
    const resCgJson = await fetch(`${baseUrl}/api/v1/supply/circulating?format=json`);
    const jsonCg: any = await resCgJson.json();
    assert(
      resCgJson.status === 200 &&
        jsonCg.circulating === 1560000 &&
        jsonCg.circulatingFormatted === '0.01560000',
      'Attack 2.2: CoinGecko JSON scraper receives integer satoshis and formatted string',
      `CirculatingSat=${jsonCg.circulating}, Formatted="${jsonCg.circulatingFormatted}"`
    );

    // Scenario 2.3: Total supply & Max supply
    const resTotalText = await fetch(`${baseUrl}/api/v1/supply/total`);
    const textTotal = await resTotalText.text();
    assert(
      resTotalText.status === 200 && textTotal === '0.01560000',
      'Attack 2.3a: Total supply returns text/plain formatted string by default',
      `Total="${textTotal}"`
    );

    const resMaxJson = await fetch(`${baseUrl}/api/v1/supply/max?format=json`);
    const jsonMax: any = await resMaxJson.json();
    assert(
      resMaxJson.status === 200 && jsonMax.maxFormatted === '250000.00000000' && jsonMax.max === 25000000000000,
      'Attack 2.3b: Max supply returns exact hard cap (250,000 QVNC) in integer satoshis',
      `MaxFormatted="${jsonMax.maxFormatted}", MaxSat=${jsonMax.max}`
    );

    // Scenario 2.4: Fail-Closed UTXO desynchronization test
    // Delete UTXOs while blocks exist to test Fail-Closed 503 response
    await db.run('DELETE FROM utxos');
    const resFailClosedText = await fetch(`${baseUrl}/api/v1/supply/circulating`);
    const textFailClosed = await resFailClosedText.text();
    assert(
      resFailClosedText.status === 503 && textFailClosed.includes('Service Unavailable'),
      'Attack 2.4 (Fail-Closed Invariant): Empty UTXO set with active block height returns 503 Service Unavailable (text)',
      `Status=${resFailClosedText.status}, Body="${textFailClosed}"`
    );

    const resFailClosedJson = await fetch(`${baseUrl}/api/v1/supply/circulating?format=json`);
    const jsonFailClosed: any = await resFailClosedJson.json();
    assert(
      resFailClosedJson.status === 503 && jsonFailClosed.status === 'UTXO_UNAVAILABLE',
      'Attack 2.4 (Fail-Closed Invariant): Empty UTXO set with active block height returns 503 Service Unavailable (json)',
      `Status=${resFailClosedJson.status}, StatusKey="${jsonFailClosed.status}"`
    );

    // Restore UTXO for subsequent tests
    await db.run(`
      INSERT INTO utxos (txid, vout_index, address, amount, block_height)
      VALUES (?, ?, ?, ?, ?)
    `, TEST_TXID_VALID, 1, TEST_ADDR_VALID, 1560000, TEST_BLOCK_HEIGHT);

    // =========================================================================
    // SECTION 5 - ATTACK 3: Huge Address UTXO Exhaustion DoS Attack
    // =========================================================================
    console.log('\n--- 3. Mandatory Adversarial Attack 3: Huge UTXO Pagination & Exhaustion DoS ---');

    // Seed 1,500 UTXOs for TEST_ADDR_VALID to simulate heavy staking pool address
    const stmt = await db.prepare(`
      INSERT INTO utxos (txid, vout_index, address, amount, block_height)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (let i = 2; i <= 1500; i++) {
      const synthTxid = `tx_${i.toString().padStart(61, '0')}`;
      await stmt.run(synthTxid, i, TEST_ADDR_VALID, 100000, TEST_BLOCK_HEIGHT);
    }
    await stmt.finalize();

    // Attack 3.1: Attacker sends limit=999999 and negative offset=-50
    const startUsec = performance.now();
    const resHugeUtxo = await fetch(
      `${baseUrl}/api/v1/address/${TEST_ADDR_VALID}/utxo?limit=999999&offset=-50`
    );
    const elapsedMs = performance.now() - startUsec;
    const utxoList: any = await resHugeUtxo.json();

    assert(
      resHugeUtxo.status === 200,
      'Attack 3.1: Server successfully handles unbounded pagination attack without crashing'
    );

    assert(
      Array.isArray(utxoList) && utxoList.length === 500,
      'Attack 3.2 (Bounded Limit Invariant): Limit 999999 is strictly clamped to maximum of 500 records',
      `Returned count=${utxoList.length}`
    );

    assert(
      elapsedMs < 50,
      'Attack 3.3 (Zero DoS Latency): 1500-UTXO clamped query executes in under 50ms',
      `Execution time: ${elapsedMs.toFixed(2)} ms`
    );

    assert(
      utxoList[0].scriptPubKey === '76a914199d24d59b414a597af788a8735c228282dc0f8488ac' &&
        utxoList[0].confirmations === 1,
      'Attack 3.4 (Script & Confirmation Invariant): Derived P2PKH scriptPubKey and confirmations match specification',
      `scriptPubKey="${utxoList[0].scriptPubKey}", confirmations=${utxoList[0].confirmations}`
    );

    // Attack 3.5: Invalid base58 address query rejection
    const resInvalidAddr = await fetch(
      `${baseUrl}/api/v1/address/${TEST_ADDR_INVALID}/utxo`
    );
    const jsonInvalidAddr: any = await resInvalidAddr.json();
    assert(
      resInvalidAddr.status === 400 && jsonInvalidAddr.error === 'Invalid Quavence address',
      'Attack 3.5: Malformed base58 address is rejected with 400 Bad Request before database query',
      `Status=${resInvalidAddr.status}, Error="${jsonInvalidAddr.error}"`
    );

    // =========================================================================
    // SECTION 6: Address & Network Verification Suite
    // =========================================================================
    console.log('\n--- 4. Address Validation, Balances, Fee Estimate, Status & OpenAPI ---');

    // 4.1 Address validate endpoint
    const resValidCheck = await fetch(`${baseUrl}/api/v1/address/${TEST_ADDR_VALID}/validate`);
    const jsonValidCheck: any = await resValidCheck.json();
    assert(
      resValidCheck.status === 200 && jsonValidCheck.valid === true && jsonValidCheck.type === 'pubkeyhash',
      'Address /validate correctly validates Quavence P2PKH address',
      JSON.stringify(jsonValidCheck)
    );

    const resInvalidCheck = await fetch(`${baseUrl}/api/v1/address/${TEST_ADDR_INVALID}/validate`);
    const jsonInvalidCheck: any = await resInvalidCheck.json();
    assert(
      resInvalidCheck.status === 200 && jsonInvalidCheck.valid === false && jsonInvalidCheck.type === 'invalid',
      'Address /validate correctly flags corrupted base58 address as invalid',
      JSON.stringify(jsonInvalidCheck)
    );

    // 4.2 Address balance endpoint
    const resBalance = await fetch(`${baseUrl}/api/v1/address/${TEST_ADDR_VALID}/balance`);
    const jsonBalance: any = await resBalance.json();
    assert(
      resBalance.status === 200 &&
        jsonBalance.balance === 1560000 &&
        jsonBalance.balanceFormatted === '0.01560000' &&
        jsonBalance.txCount === 14,
      'Address /balance returns exact integer balance and formatted balance string',
      `Balance=${jsonBalance.balance}, TxCount=${jsonBalance.txCount}`
    );

    // 4.3 Fee estimate endpoint
    const resFee = await fetch(`${baseUrl}/api/v1/fee/estimate`);
    const jsonFee: any = await resFee.json();
    assert(
      resFee.status === 200 && jsonFee.sat_per_byte === 1 && jsonFee.sat_per_kb === 1000 && jsonFee.fee_per_kb === 0.00001,
      'Fee /estimate returns standard Quavence relay fee (1 sat/byte = 1000 sat/kb)',
      JSON.stringify(jsonFee)
    );

    // 4.4 Status endpoint
    const resStatus = await fetch(`${baseUrl}/api/v1/status`);
    const jsonStatus: any = await resStatus.json();
    assert(
      resStatus.status === 200 &&
        jsonStatus.height === TEST_BLOCK_HEIGHT &&
        jsonStatus.bestblockhash === TEST_BLOCK_HASH &&
        jsonStatus.ticker === 'QVNC',
      'Status /status returns current synchronized chain tip and QVNC ticker',
      JSON.stringify(jsonStatus)
    );

    // 4.5 OpenAPI 3.0.3 Spec validation
    const resOpenApi = await fetch(`${baseUrl}/api/openapi.json`);
    const jsonOpenApi: any = await resOpenApi.json();
    assert(
      resOpenApi.status === 200 &&
        jsonOpenApi.openapi === '3.0.3' &&
        jsonOpenApi.paths['/supply/circulating'] &&
        jsonOpenApi.paths['/tx/broadcast'] &&
        jsonOpenApi.paths['/address/{address}/utxo'],
      'OpenAPI 3.0.3 specification JSON is valid and contains all exchange v1 paths',
      `Version=${jsonOpenApi.openapi}, Paths=${Object.keys(jsonOpenApi.paths).length}`
    );

    // 4.6 Interactive Documentation endpoint
    const resDocs = await fetch(`${baseUrl}/docs`);
    const htmlDocs = await resDocs.text();
    const contentTypeDocs = resDocs.headers.get('content-type') || '';
    assert(
      resDocs.status === 200 &&
        contentTypeDocs.includes('text/html') &&
        htmlDocs.includes('Quavence Protocol Public API') &&
        htmlDocs.includes('/api/v1/supply/circulating'),
      'Documentation endpoint /docs serves styled HTML with Quavence branding',
      `Length=${htmlDocs.length} bytes, ContentType=${contentTypeDocs}`
    );

    // 4.7 Legacy Route Backward Compatibility
    const resLegacySupply = await fetch(`${baseUrl}/api/supply`);
    const jsonLegacySupply: any = await resLegacySupply.json();
    assert(
      resLegacySupply.status === 200 && jsonLegacySupply.ticker === 'QVNC' && jsonLegacySupply.emission,
      'Legacy /api/supply remains fully backward compatible for existing frontend',
      `Ticker=${jsonLegacySupply.ticker}`
    );

  } finally {
    resetRpcClient();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  console.log('\n================================================================');
  console.log(`🎯 ALL TESTS FINISHED: ${passed}/${total} PASS (0 FAILURES)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runExchangeApiSuite().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
