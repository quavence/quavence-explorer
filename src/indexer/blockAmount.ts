export type PrimaryAmountKind = 'transfer_volume' | 'block_reward';
export type AmountBadge = 'transfer' | 'reward' | 'mixed';

export const REWARD_TX_TYPES = new Set(['stake_reward', 'coinbase', 'bootstrap']);
export const TRANSFER_TX_TYPE = 'normal_transfer';

export function isRewardTransactionType(txType: string): boolean {
  return REWARD_TX_TYPES.has(txType);
}

export interface BlockAmountInput {
  reward_amount: number | null;
  transfer_volume_amount: number;
  user_tx_count: number;
  has_reward_tx: boolean;
}

export interface BlockAmountFields {
  reward_amount: number | null;
  transfer_volume_amount: number;
  user_tx_count: number;
  primary_amount: number | null;
  primary_amount_kind: PrimaryAmountKind;
  primary_amount_label: string;
  amount_badge: AmountBadge;
}

export function computeBlockAmountFields(input: BlockAmountInput): BlockAmountFields {
  const reward_amount = input.reward_amount;
  const transfer_volume_amount = Math.max(0, Number(input.transfer_volume_amount || 0));
  const user_tx_count = Math.max(0, Number(input.user_tx_count || 0));
  const has_reward_tx = Boolean(input.has_reward_tx);

  const hasTransfer = transfer_volume_amount > 0;

  let amount_badge: AmountBadge;
  if (hasTransfer && has_reward_tx) {
    amount_badge = 'mixed';
  } else if (hasTransfer) {
    amount_badge = 'transfer';
  } else {
    amount_badge = 'reward';
  }

  if (hasTransfer) {
    return {
      reward_amount,
      transfer_volume_amount,
      user_tx_count,
      primary_amount: transfer_volume_amount,
      primary_amount_kind: 'transfer_volume',
      primary_amount_label: 'Output volume',
      amount_badge,
    };
  }

  return {
    reward_amount,
    transfer_volume_amount,
    user_tx_count,
    primary_amount: reward_amount,
    primary_amount_kind: 'block_reward',
    primary_amount_label: 'Reward only',
    amount_badge,
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
