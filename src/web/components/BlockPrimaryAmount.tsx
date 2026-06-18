import React from 'react';
import { formatQVNC } from '../utils/formatting';

function badgeLabel(badge: string | null | undefined): string {
  if (badge === 'transfer') return 'Transfer';
  if (badge === 'mixed') return 'Mixed';
  return 'Reward';
}

export default function BlockPrimaryAmount({
  block,
}: {
  block: {
    primary_amount?: number | null;
    primary_amount_kind?: string | null;
    primary_amount_label?: string | null;
    amount_badge?: string | null;
    reward_amount?: number | null;
    reward?: number | null;
    transfer_volume_amount?: number | null;
  };
}) {
  const rewardAmount = block.reward_amount ?? block.reward ?? null;
  const isRewardOnly = block.primary_amount_kind === 'block_reward' || block.amount_badge === 'reward';
  const tooltip = rewardAmount != null && !isRewardOnly
    ? `Block reward: ${formatQVNC(rewardAmount)}`
    : undefined;

  return (
    <div
      className={`block-primary-amount ${isRewardOnly ? 'reward-only' : 'has-activity'}`}
      title={tooltip}
    >
      <div className="block-primary-amount-value">{formatQVNC(block.primary_amount)}</div>
      <div className="block-primary-amount-meta">
        <span className={`badge amount-badge ${block.amount_badge || 'reward'}`}>
          {badgeLabel(block.amount_badge)}
        </span>
        {block.primary_amount_label ? (
          <span className="block-primary-amount-label">{block.primary_amount_label}</span>
        ) : null}
      </div>
    </div>
  );
}
