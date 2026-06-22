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

  const multiInputMisread = classifyTransferAmount({
    outputs: [
      { address: 'SXsender', amount: ONE_QVNC, vout_index: 0 },
      { address: 'SXrecipient', amount: 57_962_990_000, vout_index: 1 },
    ],
    spentInputs: [
      { address: 'SXsender', amount: ONE_QVNC },
      { address: 'SXfunding', amount: 57_962_990_000 },
    ],
    expectedInputCount: 2,
    feeAmount: 1_000_000,
  });
  assert(multiInputMisread.amount_net_transfer === ONE_QVNC, 'multi-input: payment is the small output');
  assert(multiInputMisread.change_amount === 57_962_990_000, 'multi-input: large external output is change');
  console.log('OK multi-input small payment to input address');

  const freshChangeAddress = classifyTransferAmount({
    outputs: [
      { address: 'SXrecipient', amount: ONE_QVNC, vout_index: 0 },
      { address: 'SXnewchange', amount: CHANGE, vout_index: 1 },
    ],
    spentInputs: [{ address: 'SXsender', amount: INPUT }],
    expectedInputCount: 1,
    feeAmount: 1_000_000,
  });
  assert(freshChangeAddress.amount_net_transfer === ONE_QVNC, 'fresh change address: smaller output is payment');
  assert(freshChangeAddress.change_amount === CHANGE, 'fresh change address: larger output is change');
  console.log('OK fresh change address');

  const bountyPayoutFreshOutputs = classifyTransferAmount({
    outputs: [
      { address: 'SXbotdeposit', amount: 1_000_000_000, vout_index: 0 },
      { address: 'SXfreshchange', amount: 387_900_000, vout_index: 1 },
    ],
    spentInputs: [{ address: 'SXdevfee', amount: 1_387_900_000 }],
    expectedInputCount: 1,
    feeAmount: 100_000,
  });
  assert(bountyPayoutFreshOutputs.amount_net_transfer === 1_000_000_000, 'bounty payout: 10 QVNC payment must not be swapped with change');
  assert(bountyPayoutFreshOutputs.change_amount === 387_900_000, 'bounty payout: ~3.879 QVNC change');
  assert(bountyPayoutFreshOutputs.amount_confidence === 'estimated', 'bounty payout fresh outputs => estimated');
  console.log('OK bounty payout fresh payment larger than change');

  const treasuryPayoutChangeHome = classifyTransferAmount({
    outputs: [
      { address: 'SXdevfee', amount: 2_523_333, vout_index: 0 },
      { address: 'SXbotdeposit', amount: 112_000_000, vout_index: 1 },
    ],
    spentInputs: [{ address: 'SXdevfee', amount: 114_533_333 }],
    expectedInputCount: 1,
    feeAmount: 10_000,
  });
  assert(
    treasuryPayoutChangeHome.amount_net_transfer === 112_000_000,
    'treasury payout: 1.12 QVNC payment must not be swapped with small change back to source',
  );
  assert(treasuryPayoutChangeHome.change_amount === 2_523_333, 'treasury payout: ~0.02523333 change');
  assert(treasuryPayoutChangeHome.amount_confidence === 'exact', 'treasury payout single-input => exact');
  console.log('OK treasury payout large payment with small change back to source');

  const treasuryPayoutFreshDual = classifyTransferAmount({
    outputs: [
      { address: 'SXbotdeposit', amount: 112_000_000, vout_index: 0 },
      { address: 'SXfreshchange', amount: 2_523_333, vout_index: 1 },
    ],
    spentInputs: [
      { address: 'SXdevfee', amount: 110_000_000 },
      { address: 'SXfunding', amount: 4_533_333 },
    ],
    expectedInputCount: 2,
    feeAmount: 10_000,
  });
  assert(treasuryPayoutFreshDual.amount_net_transfer === 112_000_000, 'treasury payout: fresh dual outputs keep large payment');
  assert(treasuryPayoutFreshDual.change_amount === 2_523_333, 'treasury payout: fresh dual outputs keep small change');
  console.log('OK treasury payout fresh dual outputs');

  const treasuryPayoutModerateRatio = classifyTransferAmount({
    outputs: [
      { address: 'SXbotdeposit', amount: 6_000_000, vout_index: 0 },
      { address: 'SXfreshchange', amount: 1_503_333, vout_index: 1 },
    ],
    spentInputs: [
      { address: 'SXwalletA', amount: 4_990_000 },
      { address: 'SXwalletB', amount: 2_523_333 },
    ],
    expectedInputCount: 2,
    feeAmount: 10_000,
  });
  assert(treasuryPayoutModerateRatio.amount_net_transfer === 6_000_000, '0.06 payment must not be classified as change when ratio < 5');
  assert(treasuryPayoutModerateRatio.change_amount === 1_503_333, '0.015 change must stay change');
  console.log('OK treasury payout moderate ratio fresh dual outputs');

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
