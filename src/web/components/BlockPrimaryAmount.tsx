import React from 'react';
import { formatQVNC } from '../utils/formatting';

function badgeLabel(badge: string | null | undefined): string {
  if (badge === 'transfer') return 'Outputs';
  if (badge === 'mixed') return 'Reward+Outputs';
  return 'Reward';
}

function buildTooltip(block: {
  amount_badge?: string | null;
  reward_amount?: number | null;
  reward?: number | null;
  raw_output_volume_amount?: number | null;
  transfer_volume_amount?: number | null;
  amount_confidence?: string | null;
}): string | undefined {
  const rewardAmount = block.reward_amount ?? block.reward ?? null;
  const outputVolume = Number(block.raw_output_volume_amount || 0);
  const estimatedNet = Number(block.transfer_volume_amount || 0);
  const parts: string[] = [];

  if (block.amount_badge === 'mixed' && rewardAmount != null) {
    parts.push(`Block reward: ${formatQVNC(rewardAmount)}`);
  }
  if (outputVolume > 0) {
    parts.push(`Transfer outputs (on-chain): ${formatQVNC(outputVolume)}`);
  }
  if (estimatedNet > 0 && estimatedNet !== outputVolume) {
    const confidence = block.amount_confidence && block.amount_confidence !== 'exact'
      ? ` (${block.amount_confidence})`
      : '';
    parts.push(`Est. net to recipients${confidence}: ${formatQVNC(estimatedNet)}`);
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
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
    raw_output_volume_amount?: number | null;
    transfer_volume_amount?: number | null;
    amount_confidence?: string | null;
  };
}) {
  const isRewardOnly = block.primary_amount_kind === 'block_reward' || block.amount_badge === 'reward';
  const tooltip = buildTooltip(block);

  return (
    <div
      className={`block-primary-amount ${isRewardOnly ? 'reward-only' : 'has-activity'}`}
      title={tooltip}
    >
      <span className="block-primary-amount-value">{formatQVNC(block.primary_amount)}</span>
      <span className={`badge amount-badge ${block.amount_badge || 'reward'}`}>
        {badgeLabel(block.amount_badge)}
      </span>
    </div>
  );
}
