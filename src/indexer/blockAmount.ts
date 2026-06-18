export type PrimaryAmountKind = 'transfer' | 'block_reward' | 'unknown_output';
export type AmountBadge = 'transfer' | 'reward' | 'mixed';
export type BlockAmountConfidence = 'exact' | 'estimated' | 'unknown';

export const REWARD_TX_TYPES = new Set(['stake_reward', 'coinbase', 'bootstrap']);
export const TRANSFER_TX_TYPE = 'normal_transfer';

export function isRewardTransactionType(txType: string): boolean {
  return REWARD_TX_TYPES.has(txType);
}

export interface BlockAmountInput {
  reward_amount: number | null;
  transfer_volume_amount: number;
  raw_output_volume_amount: number;
  change_amount: number;
  fee_amount: number;
  user_tx_count: number;
  has_reward_tx: boolean;
  amount_confidence: BlockAmountConfidence;
}

export interface BlockAmountFields {
  reward_amount: number | null;
  transfer_volume_amount: number;
  raw_output_volume_amount: number;
  change_amount: number;
  fee_amount: number;
  user_tx_count: number;
  primary_amount: number | null;
  primary_amount_kind: PrimaryAmountKind;
  primary_amount_label: string;
  amount_badge: AmountBadge;
  amount_confidence: BlockAmountConfidence;
}

export function computeBlockAmountFields(input: BlockAmountInput): BlockAmountFields {
  const reward_amount = input.reward_amount;
  const transfer_volume_amount = Math.max(0, Number(input.transfer_volume_amount || 0));
  const raw_output_volume_amount = Math.max(0, Number(input.raw_output_volume_amount || 0));
  const change_amount = Math.max(0, Number(input.change_amount || 0));
  const fee_amount = Math.max(0, Number(input.fee_amount || 0));
  const user_tx_count = Math.max(0, Number(input.user_tx_count || 0));
  const has_reward_tx = Boolean(input.has_reward_tx);
  const amount_confidence = input.amount_confidence || 'unknown';

  const hasNetTransfer = transfer_volume_amount > 0 && amount_confidence !== 'unknown';
  const hasUnknownOutput = raw_output_volume_amount > 0 && amount_confidence === 'unknown';

  let amount_badge: AmountBadge;
  if ((hasNetTransfer || hasUnknownOutput) && has_reward_tx) {
    amount_badge = 'mixed';
  } else if (hasNetTransfer || hasUnknownOutput) {
    amount_badge = 'transfer';
  } else {
    amount_badge = 'reward';
  }

  if (hasNetTransfer) {
    return {
      reward_amount,
      transfer_volume_amount,
      raw_output_volume_amount,
      change_amount,
      fee_amount,
      user_tx_count,
      primary_amount: transfer_volume_amount,
      primary_amount_kind: 'transfer',
      primary_amount_label: 'Transferred',
      amount_badge,
      amount_confidence,
    };
  }

  if (hasUnknownOutput) {
    return {
      reward_amount,
      transfer_volume_amount,
      raw_output_volume_amount,
      change_amount,
      fee_amount,
      user_tx_count,
      primary_amount: raw_output_volume_amount,
      primary_amount_kind: 'unknown_output',
      primary_amount_label: 'Output volume',
      amount_badge,
      amount_confidence,
    };
  }

  return {
    reward_amount,
    transfer_volume_amount,
    raw_output_volume_amount,
    change_amount,
    fee_amount,
    user_tx_count,
    primary_amount: reward_amount,
    primary_amount_kind: 'block_reward',
    primary_amount_label: 'Reward only',
    amount_badge,
    amount_confidence,
  };
}

export function amountBadgeLabel(badge: AmountBadge | string | null | undefined): string {
  if (badge === 'transfer') return 'Transfer';
  if (badge === 'mixed') return 'Mixed';
  return 'Reward';
}

export function txTypeDisplayLabel(txType: string | null | undefined): string {
  if (txType === TRANSFER_TX_TYPE) return 'Transfer';
  if (isRewardTransactionType(String(txType || ''))) return 'Reward';
  return String(txType || 'unknown');
}

export function txTypeBadgeClass(txType: string | null | undefined): string {
  if (txType === TRANSFER_TX_TYPE) return 'normal_transfer';
  if (isRewardTransactionType(String(txType || ''))) return 'stake_reward';
  return String(txType || 'unknown');
}
