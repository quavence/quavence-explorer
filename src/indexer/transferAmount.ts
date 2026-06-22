export type AmountConfidence = 'exact' | 'estimated' | 'unknown';
export type TxAmountKind = 'transfer' | 'self_change' | 'unknown_output' | 'reward';

export interface TransferOutputLine {
  address: string | null;
  amount: number;
  vout_index: number;
  role: 'recipient' | 'change' | 'unknown';
}

export interface TransferInputLine {
  address: string;
  amount: number;
}

export interface ClassifiedTransferAmount {
  amount_raw_output: number;
  amount_net_transfer: number;
  change_amount: number;
  fee_amount: number;
  amount_kind: TxAmountKind;
  amount_confidence: AmountConfidence;
  recipient_outputs: TransferOutputLine[];
  change_outputs: TransferOutputLine[];
}

/** When payment is much smaller than change, address-only heuristics can swap them. */
const PAYMENT_SIZE_DOMINANCE_RATIO = 5;
/** Two fresh outputs with similar sizes: below this share, the smaller output is the payment. */
const FRESH_DUAL_SMALL_PAYMENT_MAX_SHARE = 0.3;

export function extractOutputAddress(vout: {
  scriptPubKey?: {
    address?: string;
    addresses?: string[];
  };
}): string | null {
  if (!vout?.scriptPubKey) return null;
  if (vout.scriptPubKey.address) return vout.scriptPubKey.address;
  if (Array.isArray(vout.scriptPubKey.addresses) && vout.scriptPubKey.addresses.length > 0) {
    return vout.scriptPubKey.addresses[0];
  }
  return null;
}

function buildResult({
  outputs,
  recipientOutputs,
  changeOutputs,
  feeAmount,
  confidence,
}: {
  outputs: Array<{ address: string | null; amount: number; vout_index: number }>;
  recipientOutputs: TransferOutputLine[];
  changeOutputs: TransferOutputLine[];
  feeAmount: number;
  confidence: AmountConfidence;
}): ClassifiedTransferAmount {
  const amount_raw_output = outputs.reduce((sum, out) => sum + out.amount, 0);
  const amount_net_transfer = recipientOutputs.reduce((sum, out) => sum + out.amount, 0);
  const change_amount = changeOutputs.reduce((sum, out) => sum + out.amount, 0);

  let amount_kind: TxAmountKind = 'transfer';
  if (amount_net_transfer === 0 && change_amount > 0) {
    amount_kind = 'self_change';
  }

  return {
    amount_raw_output,
    amount_net_transfer,
    change_amount,
    fee_amount: feeAmount,
    amount_kind,
    amount_confidence: confidence,
    recipient_outputs: recipientOutputs,
    change_outputs: changeOutputs,
  };
}

function toLine(
  out: { address: string | null; amount: number; vout_index: number },
  role: TransferOutputLine['role'],
): TransferOutputLine {
  return { ...out, role };
}

function classifyTwoOutputsWithInputs(
  outputs: Array<{ address: string | null; amount: number; vout_index: number }>,
  inputAddresses: Set<string>,
  feeAmount: number,
): ClassifiedTransferAmount | null {
  if (outputs.length !== 2) return null;
  if (!outputs.every((out) => out.address)) return null;

  const sorted = [...outputs].sort((a, b) => a.amount - b.amount);
  const smaller = sorted[0];
  const larger = sorted[1];
  const smallerInInput = inputAddresses.has(smaller.address!);
  const largerInInput = inputAddresses.has(larger.address!);
  const ratio = larger.amount / Math.max(smaller.amount, 1);

  let payment = smaller;
  let change = larger;
  let confidence: AmountConfidence = 'exact';

  if (!smallerInInput && !largerInInput) {
    if (ratio >= PAYMENT_SIZE_DOMINANCE_RATIO) {
      // e.g. 1 QVNC payment with hundreds of QVNC change — payment is the small output.
      payment = smaller;
      change = larger;
      confidence = 'exact';
    } else {
      const smallerShare = smaller.amount / larger.amount;
      if (smallerShare < FRESH_DUAL_SMALL_PAYMENT_MAX_SHARE) {
        // e.g. 2 QVNC payment with 8 QVNC change to a fresh change address.
        payment = smaller;
        change = larger;
      } else {
        // e.g. 10 QVNC bounty payout with ~3.88 QVNC change — payment is the large output.
        payment = larger;
        change = smaller;
      }
      confidence = 'estimated';
    }
  } else if (!smallerInInput && largerInInput) {
    // Common: small payment to recipient, large change back to a known input address.
    payment = smaller;
    change = larger;
  } else if (smallerInInput && !largerInInput) {
    // Single-input spend: small output back to the sender wallet is change; the
    // external output is the payment (common treasury/bot payout from DevFee UTXO).
    if (inputAddresses.size === 1) {
      payment = larger;
      change = smaller;
      confidence = 'exact';
    } else if (ratio >= PAYMENT_SIZE_DOMINANCE_RATIO) {
      // Multi-input: small output to a known input address can be the payment while
      // a large external output is consolidation change.
      payment = smaller;
      change = larger;
    } else {
      payment = larger;
      change = smaller;
      confidence = 'estimated';
    }
  } else {
    // Both outputs reuse input addresses — consolidate / self-transfer.
    return buildResult({
      outputs,
      recipientOutputs: [],
      changeOutputs: outputs.map((out) => toLine(out, 'change')),
      feeAmount,
      confidence: 'exact',
    });
  }

  return buildResult({
    outputs,
    recipientOutputs: [toLine(payment, 'recipient')],
    changeOutputs: [toLine(change, 'change')],
    feeAmount,
    confidence,
  });
}

function classifyByInputAddresses(
  outputs: Array<{ address: string | null; amount: number; vout_index: number }>,
  inputAddresses: Set<string>,
  feeAmount: number,
): ClassifiedTransferAmount {
  const recipient_outputs: TransferOutputLine[] = [];
  const change_outputs: TransferOutputLine[] = [];

  for (const out of outputs) {
    if (!out.address) {
      recipient_outputs.push(toLine(out, 'unknown'));
      continue;
    }
    if (inputAddresses.has(out.address)) {
      change_outputs.push(toLine(out, 'change'));
    } else {
      recipient_outputs.push(toLine(out, 'recipient'));
    }
  }

  let confidence: AmountConfidence = 'exact';

  if (change_outputs.length === 1 && recipient_outputs.length === 1) {
    const changeOut = change_outputs[0];
    const recipientOut = recipient_outputs[0];
    const ratio = Math.max(changeOut.amount, recipientOut.amount)
      / Math.max(Math.min(changeOut.amount, recipientOut.amount), 1);

    if (recipientOut.amount > changeOut.amount * PAYMENT_SIZE_DOMINANCE_RATIO) {
      return buildResult({
        outputs,
        recipientOutputs: [toLine(changeOut, 'recipient')],
        changeOutputs: [toLine(recipientOut, 'change')],
        feeAmount,
        confidence: 'exact',
      });
    }

    if (changeOut.amount > recipientOut.amount * PAYMENT_SIZE_DOMINANCE_RATIO) {
      confidence = ratio >= PAYMENT_SIZE_DOMINANCE_RATIO ? 'exact' : 'estimated';
    }
  }

  return buildResult({
    outputs,
    recipientOutputs: recipient_outputs,
    changeOutputs: change_outputs,
    feeAmount,
    confidence,
  });
}

export function classifyTransferAmount({
  outputs,
  spentInputs,
  expectedInputCount,
  feeAmount,
}: {
  outputs: Array<{ address: string | null; amount: number; vout_index: number }>;
  spentInputs: TransferInputLine[];
  expectedInputCount: number;
  feeAmount: number;
}): ClassifiedTransferAmount {
  const amount_raw_output = outputs.reduce((sum, out) => sum + out.amount, 0);
  const inputAddresses = new Set(spentInputs.map((input) => input.address));
  const inputsResolved = expectedInputCount > 0 && spentInputs.length === expectedInputCount;

  if (!inputsResolved || outputs.length === 0) {
    return {
      amount_raw_output,
      amount_net_transfer: 0,
      change_amount: 0,
      fee_amount: feeAmount,
      amount_kind: 'unknown_output',
      amount_confidence: 'unknown',
      recipient_outputs: outputs.map((out) => toLine(out, 'unknown')),
      change_outputs: [],
    };
  }

  const twoOutput = classifyTwoOutputsWithInputs(outputs, inputAddresses, feeAmount);
  if (twoOutput) {
    return twoOutput;
  }

  return classifyByInputAddresses(outputs, inputAddresses, feeAmount);
}

export function classifyTransferAmountFromIndexedRows({
  spentInputs,
  receivedOutputs,
  feeAmount,
}: {
  spentInputs: TransferInputLine[];
  receivedOutputs: Array<{ address: string; amount: number; vout_index?: number }>;
  feeAmount: number;
}): ClassifiedTransferAmount {
  const outputs = receivedOutputs.map((row, index) => ({
    address: row.address,
    amount: row.amount,
    vout_index: row.vout_index ?? index,
  }));
  return classifyTransferAmount({
    outputs,
    spentInputs,
    expectedInputCount: spentInputs.length > 0 ? spentInputs.length : 0,
    feeAmount,
  });
}
