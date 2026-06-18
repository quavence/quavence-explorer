#!/usr/bin/env node
import { classifyTransferAmount } from '../src/indexer/transferAmount.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ONE_QVNC = 100_000_000;
const CHANGE = 66_125_990_000;
const INPUT = ONE_QVNC + CHANGE;

try {
  const classified = classifyTransferAmount({
    outputs: [
      { address: 'SXrecipient', amount: ONE_QVNC, vout_index: 0 },
      { address: 'SXsender', amount: CHANGE, vout_index: 1 },
    ],
    spentInputs: [{ address: 'SXsender', amount: INPUT }],
    expectedInputCount: 1,
    feeAmount: 1_000_000,
  });

  assert(classified.amount_net_transfer === ONE_QVNC, 'net transfer must exclude change');
  assert(classified.change_amount === CHANGE, 'change must be detected');
  assert(classified.amount_confidence === 'exact', 'confidence must be exact when inputs known');
  assert(classified.amount_kind === 'transfer', 'kind must be transfer');
  console.log('OK recipient + change split');

  const selfOnly = classifyTransferAmount({
    outputs: [{ address: 'SXsender', amount: CHANGE, vout_index: 0 }],
    spentInputs: [{ address: 'SXsender', amount: CHANGE }],
    expectedInputCount: 1,
    feeAmount: 0,
  });
  assert(selfOnly.amount_net_transfer === 0, 'self transfer net must be zero');
  assert(selfOnly.amount_kind === 'self_change', 'self transfer kind');
  console.log('OK self-change only');

  const unknown = classifyTransferAmount({
    outputs: [{ address: 'SXrecipient', amount: ONE_QVNC, vout_index: 0 }],
    spentInputs: [],
    expectedInputCount: 1,
    feeAmount: 0,
  });
  assert(unknown.amount_confidence === 'unknown', 'missing inputs => unknown');
  assert(unknown.amount_kind === 'unknown_output', 'missing inputs => unknown_output kind');
  console.log('OK unknown inputs fallback');

  console.log('verify_net_transfer_amount: PASS');
} catch (error) {
  console.error('verify_net_transfer_amount: FAIL', error?.message || error);
  process.exitCode = 1;
}
