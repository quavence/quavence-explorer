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
      recipient_outputs: outputs.map((out) => ({ ...out, role: 'unknown' as const })),
      change_outputs: [],
    };
  }

  let amount_net_transfer = 0;
  let change_amount = 0;
  const recipient_outputs: TransferOutputLine[] = [];
  const change_outputs: TransferOutputLine[] = [];

  for (const out of outputs) {
    if (!out.address) {
      amount_net_transfer += out.amount;
      recipient_outputs.push({ ...out, role: 'unknown' });
      continue;
    }
    if (inputAddresses.has(out.address)) {
      change_amount += out.amount;
      change_outputs.push({ ...out, role: 'change' });
    } else {
      amount_net_transfer += out.amount;
      recipient_outputs.push({ ...out, role: 'recipient' });
    }
  }

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
    amount_confidence: 'exact',
    recipient_outputs,
    change_outputs,
  };
}

export function classifyTransferAmountFromIndexedRows({
  spentInputs,
  receivedOutputs,
  feeAmount,
}: {
  spentInputs: TransferInputLine[];
  receivedOutputs: Array<{ address: string; amount: number }>;
  feeAmount: number;
}): ClassifiedTransferAmount {
  const outputs = receivedOutputs.map((row, index) => ({
    address: row.address,
    amount: row.amount,
    vout_index: index,
  }));
  return classifyTransferAmount({
    outputs,
    spentInputs,
    expectedInputCount: spentInputs.length > 0 ? spentInputs.length : 0,
    feeAmount,
  });
}
