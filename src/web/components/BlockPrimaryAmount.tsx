import React from 'react';
import { formatQVNC, formatTime, shortenHash } from '../utils/formatting';

function badgeLabel(badge: string | null | undefined): string {
  if (badge === 'transfer') return 'Transfer';
  if (badge === 'mixed') return 'Reward+Transfer';
  return 'Reward';
}

export default function BlockPrimaryAmount({
  block,
}: {
  block: {
    primary_amount?: number | null;
    reward?: number | null;
    reward_amount?: number | null;
    raw_output_volume_amount?: number | null;
    user_tx_count?: number | null;
    amount_badge?: string | null;
  };
}) {
  const hasTransfers = Number(block.user_tx_count || 0) > 0;
  const rewardAmount = block.reward_amount ?? block.reward ?? block.primary_amount ?? null;
  const transferTotal = Number(block.raw_output_volume_amount || 0);
  const displayAmount = hasTransfers && transferTotal > 0 ? transferTotal : rewardAmount;
  const badge = hasTransfers && transferTotal > 0 ? 'transfer' : (block.amount_badge || 'reward');
  const tooltip = hasTransfers && transferTotal > 0
    ? `Transfer output total in block. PoS reward: ${formatQVNC(rewardAmount)}`
    : undefined;

  return (
    <div
      className={`block-primary-amount ${hasTransfers ? 'has-activity' : 'reward-only'}`}
      title={tooltip}
    >
      <span className="block-primary-amount-value">{formatQVNC(displayAmount)}</span>
      <span className={`badge amount-badge ${badge}`}>
        {badgeLabel(badge)}
      </span>
    </div>
  );
}
