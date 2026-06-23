import React, { useEffect, useState } from 'react';
import { fetchJson } from '../utils/fetchJson';
import { formatQVNC, formatTime, shortenHash } from '../utils/formatting';

type Navigate = (to: string) => void;

function txTypeLabel(tx: { type?: string | null; amount?: number | null }): string {
  const txType = tx?.type;
  if (txType === 'normal_transfer') return 'Transfer';
  if (txType === 'stake_reward') return 'PoS reward';
  if (txType === 'coinbase' && Number(tx?.amount || 0) === 0) return 'PoS marker';
  if (txType === 'coinbase' || txType === 'bootstrap') return 'Coinbase';
  return txType || 'unknown';
}

function txTypeBadgeClass(tx: { type?: string | null; amount?: number | null }): string {
  const txType = tx?.type;
  if (txType === 'normal_transfer') return 'normal_transfer';
  if (txType === 'coinbase' && Number(tx?.amount || 0) === 0) return 'pos_marker';
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
  const outputVolume = Number(block?.raw_output_volume_amount || 0);
  const feeAmount = Number(block?.fee_amount || 0);
  const userTxCount = Number(block?.user_tx_count || 0);

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
              <div className="detail-section-title">On-chain summary</div>
              <div className="detail-row">
                <div className="detail-label">PoS reward</div>
                <div className="detail-value mono">{formatQVNC(rewardAmount)}</div>
              </div>
              {userTxCount > 0 ? (
                <div className="detail-row">
                  <div className="detail-label">Transfer amount</div>
                  <div className="detail-value mono">{formatQVNC(transferVolume)}</div>
                </div>
              ) : null}
              {userTxCount > 0 && outputVolume > transferVolume ? (
                <div className="detail-row">
                  <div className="detail-label">Change returned</div>
                  <div className="detail-value mono detail-muted">{formatQVNC(outputVolume - transferVolume)}</div>
                </div>
              ) : null}
              <div className="detail-row">
                <div className="detail-label">Transfer fees</div>
                <div className="detail-value mono detail-muted">
                  {feeAmount > 0 ? formatQVNC(feeAmount) : '—'}
                </div>
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
                <th>Recipients</th>
                <th>Outputs</th>
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
                    <span className={`badge ${txTypeBadgeClass(tx)}`}>{txTypeLabel(tx)}</span>
                  </td>
                  <td>{tx?.recipient_count ?? (tx?.type === 'normal_transfer' ? '—' : 1)}</td>
                  <td className="amount">
                    {tx?.type === 'normal_transfer' && Array.isArray(tx?.recipients) && tx.recipients.length > 0 ? (
                      <div className="tx-output-list">
                        {tx.recipients.map((out: any) => (
                          <div className="tx-output-line" key={`${out.address}:${out.vout_index}:${out.amount}`}>
                            <span className="mono">{formatQVNC(out.amount)}</span>
                            <span className="detail-muted mono">→ </span>
                            <a
                              href="#"
                              onClick={(e) => { e.preventDefault(); navigate(`/address/${out.address}`); }}
                              className="hash"
                            >
                              {shortenHash(out.address, 10)}
                            </a>
                          </div>
                        ))}
                        {Array.isArray(tx?.change_outputs) && tx.change_outputs.map((out: any) => (
                          <div className="tx-output-line detail-muted" key={`change:${out.address}:${out.vout_index}:${out.amount}`}>
                            <span className="mono">{formatQVNC(out.amount)}</span>
                            <span className="mono"> change → </span>
                            <a
                              href="#"
                              onClick={(e) => { e.preventDefault(); navigate(`/address/${out.address}`); }}
                              className="hash"
                            >
                              {shortenHash(out.address, 10)}
                            </a>
                          </div>
                        ))}
                        <div className="tx-output-total detail-muted">
                          Sent {formatQVNC(tx?.transfer_amount ?? tx?.amount_net_transfer ?? 0)}
                        </div>
                      </div>
                    ) : tx?.type === 'coinbase' && Number(tx?.amount || 0) === 0 ? (
                      <span className="detail-muted">Stake marker</span>
                    ) : (
                      formatQVNC(tx?.amount ?? tx?.output_total ?? 0)
                    )}
                  </td>
                  <td className="amount">{formatQVNC(tx?.fee ?? tx?.fee_amount)}</td>
                </tr>
              ))}
              {txs.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#64748b' }}>No transactions recorded for this block</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
