import assert from 'node:assert/strict';
import { isValidPublicDomain, isPrivateOrLocalIP } from '../src/api/utils/net-filter.js';
import { parseAnchorNodes } from '../src/api/routes/network.js';
import { getOfficialAnchorKeys } from '../src/api/peers.js';

console.log('================================================================');
console.log('=== QUAVENCE EXPLORER: ANCHOR NODES DOMAIN ALIASES TEST SUITE ===');
console.log('================================================================\n');

// -------------------------------------------------------------------------
// 1. Domain Validation Tests
// -------------------------------------------------------------------------
console.log('--- 1. Testing Domain Validation (isValidPublicDomain) ---');

const validDomains = [
  'seed1.quavence.com',
  'seed2.quavence.com',
  'sub.domain.quavence.org',
  'node-01.chain.net',
  'explorer.quavence.com',
];

for (const d of validDomains) {
  assert.equal(isValidPublicDomain(d), true, `Expected valid public domain: ${d}`);
}
console.log(`[PASS] Valid public domain check passed (${validDomains.length} domains)`);

const invalidDomains = [
  'localhost',
  'node.local',
  'server.internal',
  'my.lan',
  'corp.home',
  'company.corp',
  'nodot',
  'invalid_char!.com',
  ' ',
  '',
];

for (const d of invalidDomains) {
  assert.equal(isValidPublicDomain(d), false, `Expected invalid/private domain to be rejected: '${d}'`);
}
console.log(`[PASS] Invalid and private domain check passed (${invalidDomains.length} rejected)`);

// -------------------------------------------------------------------------
// 2. Private or Local IP Filter Tests (isPrivateOrLocalIP)
// -------------------------------------------------------------------------
console.log('\n--- 2. Testing isPrivateOrLocalIP Filtering ---');

const allowedPublicHosts = [
  'seed1.quavence.com',
  'seed2.quavence.com',
  '89.125.130.116',
  '80.64.31.200',
  'kalwfcd7ia3gcwksq7yipu3b2lseibic6ytmawkbvq7odlleic6lifqd.onion',
  'vh3na7dqjmqzdbvoghosbdmdmpltkhmvcvsukmtv24eo23diqqlknoqd.onion',
];

for (const h of allowedPublicHosts) {
  assert.equal(isPrivateOrLocalIP(h), false, `Expected public host to be allowed: ${h}`);
}
console.log(`[PASS] Permitted public hosts passed (${allowedPublicHosts.length} hosts)`);

const blockedPrivateHosts = [
  '127.0.0.1',
  '127.0.1.1',
  '10.0.0.1',
  '192.168.1.1',
  '192.168.0.254',
  '169.254.1.1',
  '172.16.0.1',
  '172.31.255.255',
  'localhost',
  'node.local',
  'attacker.internal',
  '::1',
  'fe80::1',
  'fc00::1',
  'malformed-host-without-tld',
];

for (const h of blockedPrivateHosts) {
  assert.equal(isPrivateOrLocalIP(h), true, `Expected private/local host to be blocked: ${h}`);
}
console.log(`[PASS] Blocked private hosts passed (${blockedPrivateHosts.length} blocked)`);

// -------------------------------------------------------------------------
// 3. parseAnchorNodes Parsing and Default Labels
// -------------------------------------------------------------------------
console.log('\n--- 3. Testing parseAnchorNodes with Hostnames & Fallbacks ---');

const sampleEnv = 'seed1.quavence.com:27714=Official VPS Anchor 1 (Clearnet IPv4),seed2.quavence.com:27714=Official VPS Anchor 2 (Clearnet IPv4),kalwfcd7ia3gcwksq7yipu3b2lseibic6ytmawkbvq7odlleic6lifqd.onion:27714=Official Core Seednode (Tor v3)';
const parsed = parseAnchorNodes(sampleEnv);

assert.equal(parsed.length, 3, 'Should parse exactly 3 nodes');

assert.equal(parsed[0].host, 'seed1.quavence.com');
assert.equal(parsed[0].port, 27714);
assert.equal(parsed[0].addnode, 'addnode=seed1.quavence.com:27714');
assert.equal(parsed[0].label, 'Official VPS Anchor 1 (Clearnet IPv4)');
assert.equal(parsed[0].networkType, 'ipv4');

assert.equal(parsed[1].host, 'seed2.quavence.com');
assert.equal(parsed[1].port, 27714);
assert.equal(parsed[1].addnode, 'addnode=seed2.quavence.com:27714');
assert.equal(parsed[1].label, 'Official VPS Anchor 2 (Clearnet IPv4)');
assert.equal(parsed[1].networkType, 'ipv4');

assert.equal(parsed[2].host, 'kalwfcd7ia3gcwksq7yipu3b2lseibic6ytmawkbvq7odlleic6lifqd.onion');
assert.equal(parsed[2].port, 27714);
assert.equal(parsed[2].networkType, 'onion');

console.log('[PASS] Full parse of PUBLIC_ANCHOR_NODES verified with correct fields');

// Test default label fallback without explicit '=Label'
const fallbackEnv = 'seed1.quavence.com:27714,seed2.quavence.com:27714,kalwfcd7ia3gcwksq7yipu3b2lseibic6ytmawkbvq7odlleic6lifqd.onion:27714';
const fallbackParsed = parseAnchorNodes(fallbackEnv);
assert.equal(fallbackParsed[0].label, 'Official VPS Anchor 1 (Clearnet IPv4)');
assert.equal(fallbackParsed[1].label, 'Official VPS Anchor 2 (Clearnet IPv4)');
assert.equal(fallbackParsed[2].label, 'Official Core Seednode (Tor v3)');
console.log('[PASS] Default label resolution for seed1/seed2 verified without explicit label');

// Adversarial filter test
const adversarialEnv = 'seed1.quavence.com:27714,localhost:27714,127.0.0.1:27714,192.168.1.1:27714,evil.local:27714,badport.com:0,badport.com:99999,badport.com:abc,seed2.quavence.com:27714';
const adversarialParsed = parseAnchorNodes(adversarialEnv);
assert.equal(adversarialParsed.length, 2, 'Adversarial inputs must be pruned; only seed1 and seed2 should remain');
assert.equal(adversarialParsed[0].host, 'seed1.quavence.com');
assert.equal(adversarialParsed[1].host, 'seed2.quavence.com');
console.log('[PASS] Adversarial inputs strictly filtered out (Fail-Closed)');

assert.deepEqual(parseAnchorNodes(undefined), []);
assert.deepEqual(parseAnchorNodes(''), []);
console.log('[PASS] Fail-closed empty / undefined inputs return empty array');

// -------------------------------------------------------------------------
// 4. getOfficialAnchorKeys Bidirectional Aliasing
// -------------------------------------------------------------------------
console.log('\n--- 4. Testing getOfficialAnchorKeys Alias Mapping ---');

const origEnv = process.env.PUBLIC_ANCHOR_NODES;
try {
  process.env.PUBLIC_ANCHOR_NODES = 'seed1.quavence.com:27714,seed2.quavence.com:27714';
  const keys = getOfficialAnchorKeys();

  assert.equal(keys.has('seed1.quavence.com:27714'), true, 'Configured hostname seed1 must be in keys');
  assert.equal(keys.has('89.125.130.116:27714'), true, 'Mapped raw IP for seed1 must be in keys to prevent peer leakage');
  assert.equal(keys.has('seed2.quavence.com:27714'), true, 'Configured hostname seed2 must be in keys');
  assert.equal(keys.has('80.64.31.200:27714'), true, 'Mapped raw IP for seed2 must be in keys to prevent peer leakage');

  // Reverse mapping test
  process.env.PUBLIC_ANCHOR_NODES = '89.125.130.116:27714,80.64.31.200:27714';
  const reverseKeys = getOfficialAnchorKeys();
  assert.equal(reverseKeys.has('seed1.quavence.com:27714'), true, 'Reverse mapped seed1 must be in keys');
  assert.equal(reverseKeys.has('89.125.130.116:27714'), true, 'Raw IP 89.125.130.116 must be in keys');
  assert.equal(reverseKeys.has('seed2.quavence.com:27714'), true, 'Reverse mapped seed2 must be in keys');
  assert.equal(reverseKeys.has('80.64.31.200:27714'), true, 'Raw IP 80.64.31.200 must be in keys');

  console.log('[PASS] getOfficialAnchorKeys bidirectional aliasing verified');
} finally {
  process.env.PUBLIC_ANCHOR_NODES = origEnv;
}

console.log('\n================================================================');
console.log('=== ALL ANCHOR NODES DOMAIN ALIASES TESTS PASSED (100%)       ===');
console.log('================================================================');
