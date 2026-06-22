import React from 'react';
import { formatQVNC } from '../utils/formatting';

function badgeLabel(badge: string | null | undefined): string {
  if (badge === 'transfer') return 'Transfers';
  if (badge === 'mixed') return 'Reward+Transfers';
  return 'Reward';
}

export default function BlockPrimaryAmount({
  block,
}: {
  block: {
    primary_amount?: number | null;
    amount_badge?: string | null;
    user_tx_count?: number | null;
  };
}) {
  const hasTransfers = Number(block.user_tx_count || 0) > 0;
  const tooltip = hasTransfers
    ? 'PoS block reward (on-chain). Open block transactions for transfer output amounts.'
    : undefined;

  return (
    <div
      className={`block-primary-amount ${hasTransfers ? 'has-activity' : 'reward-only'}`}
      title={tooltip}
    >
      <span className="block-primary-amount-value">{formatQVNC(block.primary_amount)}</span>
      <span className={`badge amount-badge ${block.amount_badge || 'reward'}`}>
        {badgeLabel(block.amount_badge)}
      </span>
    </div>
  );
}
