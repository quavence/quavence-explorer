import React, { useEffect, useState } from 'react';
import { fetchJson } from '../utils/fetchJson';
import { formatQVNC, formatTime, shortenHash } from '../utils/formatting';
import BlockPrimaryAmount from '../components/BlockPrimaryAmount';

type Navigate = (to: string) => void;

function txTypeLabel(txType: string | null | undefined): string {
  if (txType === 'normal_transfer') return 'Transfer';
  if (txType === 'stake_reward' || txType === 'coinbase' || txType === 'bootstrap') return 'Reward';
  return txType || 'unknown';
}

function txTypeBadgeClass(txType: string | null | undefined): string {
  if (txType === 'normal_transfer') return 'normal_transfer';
  if (txType === 'stake_reward' || txType === 'coinbase' || txType === 'bootstrap') return 'stake_reward';
  return txType || 'unknown';
}

export default function BlockDetailView({ heightOrHash, navigate }: { heightOrHash: string; navigate: (to: string) => void }) {
  const [block, setBlock] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBlock = async () => {
      setLoading(true);
      const [json, statusJson] = await Promise.all([
        fetchJson<any>(`/api/blocks/${heightOrHash}`, null),
        fetchJson<any>('/api/status', null)
      ]);
      setBlock(json);
      setStatus(statusJson);
      setLoading(false);
    };
    loadBlock();
  }, [heightOrHash]);

  if (loading) return <div className="loading-box">Loading block details...</div>;
  if (!block) {
    return (
      <div className="error-box">
        Block {heightOrHash} not found in the index, or API server is offline.
      </div>
    );
  }

  const txs = block?.transactions ?? [];
  const blockHeight = Number(block?.height);
  const hasNumericHeight = Number.isFinite(blockHeight);
  const latestHeight = Number(status?.height);
  const previousHeight = hasNumericHeight && blockHeight > 0 ? blockHeight - 1 : null;
  const nextHeight = hasNumericHeight && (!Number.isFinite(latestHeight) || blockHeight < latestHeight)
    ? blockHeight + 1
    : null;
  const blockType = block?.block_type ?? 'unknown';
  const blockTypeLabel = blockType === 'pos'
    ? 'PoS'
    : blockType === 'pow'
      ? 'PoW'
      : blockType.charAt(0).toUpperCase() + blockType.slice(1);
  const rewardAmount = block?.reward_amount ?? block?.reward ?? null;
  const transferVolume = Number(block?.transfer_volume_amount || 0);

  return (
    <div>
      <a href="#" onClick={(e) => { e.preventDefault(); navigate('/blocks'); }} className="back-link">
        Back to Blocks
      </a>

      <div className="panel">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-row">
            <div className="panel-heading-main">
              <h3 className="panel-title">Block #{block?.height ?? '-'}</h3>
              <p className="panel-description">{blockTypeLabel} block details and indexed transactions</p>
            </div>
            <div className="panel-heading-actions">
              <div className="block-nav">
                {previousHeight !== null && (
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${previousHeight}`); }} className="pagination-btn">
                    Previous
                  </a>
                )}
                {nextHeight !== null && (
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${nextHeight}`); }} className="pagination-btn">
                    Next
                  </a>
                )}
              </div>
              <span className={`badge ${blockType}`}>{blockType}</span>
            </div>
          </div>
        </div>
        <div className="panel-body">
          <div className="detail-grid block-detail-grid">
            <div>
              <div className="detail-section-title">Identity</div>
              <div className="detail-row">
                <div className="detail-label">Hash</div>
                <div className="detail-value mono">{block?.hash ?? '-'}</div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Previous Hash</div>
                <div className="detail-value mono">
                  {block?.previous_hash ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${block?.previous_hash}`); }}>
                      {shortenHash(block.previous_hash, 12)}
                    </a>
                  ) : (
                    'None (Genesis)'
                  )}
                </div>
              </div>
            </div>
            <div>
              <div className="detail-section-title">Timing</div>
              <div className="detail-row">
                <div className="detail-label">Timestamp</div>
                <div className="detail-value timestamp">
                  {formatTime(block?.time)}
                  <span className="detail-muted">Unix: {block?.time ?? '-'}</span>
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Size</div>
                <div className="detail-value">
                  {block?.size ? `${(block.size / 1024).toFixed(2)} KB (${block.size} bytes)` : '-'}
                </div>
              </div>
            </div>
            <div>
              <div className="detail-section-title">Consensus</div>
              <div className="detail-row">
                <div className="detail-label">Difficulty</div>
                <div className="detail-value">
                  {block?.block_type === 'pos'
                    ? `PoS: ${block?.difficulty_pos?.toFixed(6) ?? '-'}`
                    : `PoW: ${block?.difficulty_pow?.toFixed(6) ?? '-'}`}
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Transactions</div>
                <div className="detail-value">{txs.length}</div>
              </div>
            </div>
            <div>
              <div className="detail-section-title">Amounts</div>
              <div className="detail-row">
                <div className="detail-label">Primary Amount</div>
                <div className="detail-value">
                  <BlockPrimaryAmount block={block} />
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Output Volume</div>
                <div className="detail-value mono">
                  {transferVolume > 0 ? formatQVNC(transferVolume) : '—'}
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Block Reward</div>
                <div className="detail-value mono detail-muted">{formatQVNC(rewardAmount)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-row">
            <div className="panel-heading-main">
              <h3 className="panel-title">Transactions</h3>
              <p className="panel-description">Indexed transactions inside block #{block?.height ?? '-'}</p>
            </div>
            <div className="panel-heading-actions">
              <span className="result-summary">
                {txs.length === 1 ? '1 transaction' : `${txs.length} transactions`}
              </span>
            </div>
          </div>
        </div>
        <div className="table-responsive">
          <table className="dense-table">
            <thead>
              <tr>
                <th>Txid</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Fee</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx: any) => (
                <tr key={tx?.txid}>
                  <td>
                    <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/tx/${tx?.txid}`); }} className="hash">
                      {tx?.txid}
                    </a>
                  </td>
                  <td>
                    <span className={`badge ${txTypeBadgeClass(tx?.type)}`}>{txTypeLabel(tx?.type)}</span>
                  </td>
                  <td className="amount">{formatQVNC(tx?.amount)}</td>
                  <td className="amount">{formatQVNC(tx?.fee)}</td>
                </tr>
              ))}
              {txs.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>No transactions recorded for this block</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
