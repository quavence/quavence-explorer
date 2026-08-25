import React, { useEffect, useState } from 'react';
import { QUAVENCE } from '../../config';
import { fetchJson } from '../utils/fetchJson';
import { formatQVNC, formatTime, shortenHash } from '../utils/formatting';

type Navigate = (to: string) => void;

export default function TxDetailView({ txid, navigate }: { txid: string; navigate: (to: string) => void }) {
  const [tx, setTx] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statsHeight, setStatsHeight] = useState<number | null>(null);

  useEffect(() => {
    const loadTx = async () => {
      setLoading(true);
      const [json, statsJson] = await Promise.all([
        fetchJson<any>(`/api/tx/${txid}`, null),
        fetchJson<any>('/api/status', null)
      ]);
      setTx(json);
      if (statsJson) {
        setStatsHeight(statsJson.height);
      }
      setLoading(false);
    };
    loadTx();
  }, [txid]);

  if (loading) return <div className="loading-box">Loading transaction details...</div>;
  if (!tx) {
    return (
      <div className="error-box">
        Transaction {txid} not found in the database index, or API server is offline.
      </div>
    );
  }

  const contributors = tx?.contributors ?? [];
  const recipients = tx?.recipients ?? [];
  const changeOutputs = tx?.change_outputs ?? [];
  const isCoinbaseLike = tx?.type === 'stake_reward' || tx?.type === 'coinbase' || tx?.type === 'bootstrap';
  const hasIndexedIo = contributors.length > 0 || recipients.length > 0 || changeOutputs.length > 0;
  const isTransfer = tx?.type === 'normal_transfer';

  return (
    <div>
      <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${tx?.blockHeight}`); }} className="back-link">
        Back to Block #{tx?.blockHeight ?? '-'}
      </a>

      <div className="panel">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-row">
            <div className="panel-heading-main">
              <h3 className="panel-title">Transaction</h3>
              <p className="panel-description">On-chain contributors, recipients, and fees</p>
            </div>
            <div className="panel-heading-actions">
              <span className={`badge ${tx?.type}`}>{tx?.type ?? 'unknown'}</span>
            </div>
          </div>
        </div>
        <div className="panel-body">
          <div className="detail-row">
            <div className="detail-label">TXID</div>
            <div className="detail-value mono">{tx?.txid ?? '-'}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Block</div>
            <div className="detail-value mono">
              {tx?.blockHeight ? (
                <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${tx.blockHeight}`); }}>
                  #{tx.blockHeight}
                </a>
              ) : '-'}
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Timestamp</div>
            <div className="detail-value timestamp">{formatTime(tx?.time)}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Confirmations</div>
            <div className="detail-value">{tx?.confirmations ?? 0}</div>
          </div>
          {tx?.type === 'stake_reward' && (
            <div className="detail-row">
              <div className="detail-label">Maturity</div>
              <div className="detail-value">
                {statsHeight !== null ? (
                  statsHeight >= tx.blockHeight + QUAVENCE.coinbaseMaturity ? (
                    <span style={{ fontWeight: 'bold' }} className="status-ok">Matured (Spendable)</span>
                  ) : (
                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                      Immature (Spendable in {tx.blockHeight + QUAVENCE.coinbaseMaturity - statsHeight} blocks)
                    </span>
                  )
                ) : (
                  'Checking maturity...'
                )}
              </div>
            </div>
          )}
          {isTransfer ? (
            <div className="detail-row">
              <div className="detail-label">Amount sent</div>
              <div className="detail-value mono">{formatQVNC(tx?.transfer_amount ?? 0)}</div>
            </div>
          ) : null}
          {isTransfer && Number(tx?.change_amount || 0) > 0 ? (
            <div className="detail-row">
              <div className="detail-label">Change returned</div>
              <div className="detail-value mono detail-muted">{formatQVNC(tx.change_amount)}</div>
            </div>
          ) : null}
          <div className="detail-row">
            <div className="detail-label">Input total</div>
            <div className="detail-value mono">
              {tx?.input_total > 0 ? formatQVNC(tx.input_total) : (isCoinbaseLike ? 'Coinbase / PoS' : '—')}
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">{isTransfer ? 'Output total' : 'Output total'}</div>
            <div className="detail-value mono">{formatQVNC(tx?.output_total ?? 0)}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Fee</div>
            <div className="detail-value mono">{formatQVNC(tx?.fee ?? 0)}</div>
          </div>
        </div>
      </div>

      {tx?.attestation && (
        <div className="panel">
          <div className="panel-header panel-header-stacked">
            <div className="panel-heading-row">
              <div className="panel-heading-main">
                <h3 className="panel-title">PoUS AI Attestation</h3>
                <p className="panel-description">On-chain consensus proof for useful AI task execution</p>
              </div>
              <div className="panel-heading-actions">
                <span className="badge" style={{ backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
                  {tx.attestation.task_type ? tx.attestation.task_type.replace('TASK_', '') : 'AI_ATTESTATION'}
                </span>
              </div>
            </div>
          </div>
          <div className="panel-body">
            {tx.attestation.task_id && (
              <div className="detail-row">
                <div className="detail-label">Task ID</div>
                <div className="detail-value mono">{tx.attestation.task_id}</div>
              </div>
            )}
            <div className="detail-row">
              <div className="detail-label">Consensus Hash</div>
              <div className="detail-value mono" style={{ wordBreak: 'break-all' }}>
                {tx.attestation.consensus_hash}
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Consensus Agreement</div>
              <div className="detail-value mono" style={{ color: '#4ade80', fontWeight: 600 }}>
                {(Number(tx.attestation.agreement_ratio || 0) * 100).toFixed(0)}% ({tx.attestation.worker_count} AI Nodes)
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Anchor Ref Block</div>
              <div className="detail-value mono">
                <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${tx.attestation.ref_block_height}`); }}>
                  #{tx.attestation.ref_block_height}
                </a>
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Header Spec</div>
              <div className="detail-value mono detail-muted">
                QVAI (v{tx.attestation.version ?? 1}, 44-byte binary OP_RETURN)
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">Contributors & Recipients</h3>
        </div>
        <div className="panel-body">
          {hasIndexedIo ? (
            <div className="io-grid">
              <div className="io-column">
                <div className="io-title">Contributors</div>
                {contributors.length === 0 ? (
                  <div className="io-item">
                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                      {isCoinbaseLike ? 'Coinbase / PoS reward inputs' : 'No indexed inputs'}
                    </span>
                  </div>
                ) : (
                  contributors.map((input: any, index: number) => (
                    <div className="io-item io-item-stacked" key={`${input.prev_txid}:${input.prev_vout_index}:${index}`}>
                      <div className="io-row-main">
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); navigate(`/address/${input.address}`); }}
                          className="mono io-address"
                        >
                          {input.address}
                        </a>
                        <span className="amount mono">{formatQVNC(input.amount)}</span>
                      </div>
                      <div className="detail-muted mono io-prevout">
                        prevout{' '}
                        <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/tx/${input.prev_txid}`); }}>
                          {shortenHash(input.prev_txid)}
                        </a>
                        :{input.prev_vout_index}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="io-arrow">→</div>

              <div className="io-column">
                <div className="io-title">Recipients</div>
                {recipients.length === 0 ? (
                  tx.attestation ? (
                    <div className="io-item io-item-stacked">
                      <div className="io-row-main">
                        <span className="mono detail-muted" style={{ fontSize: '0.84rem' }}>
                          OP_RETURN QVAI (AI Consensus Anchor)
                        </span>
                        <span className="amount mono detail-muted">0.00000000 QVNC</span>
                      </div>
                    </div>
                  ) : (
                    <div className="io-item">
                      <span className="detail-muted">No payment outputs</span>
                    </div>
                  )
                ) : (
                  recipients.map((out: any, index: number) => (
                    <div className="io-item io-item-stacked" key={`${out.address}:${out.vout_index}:${index}`}>
                      <div className="io-row-main">
                        <div className="io-address-wrap">
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); navigate(`/address/${out.address}`); }}
                            className="mono io-address"
                          >
                            {out.address}
                          </a>
                          {out.address === 'SXbKabuHh7xn3QuXF7DMG758D9j4rVcL6V' && (
                            <span className="badge" style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '0.75rem', padding: '0.15rem 0.4rem' }}>
                              DAO Treasury (DevFee 15%)
                            </span>
                          )}
                          {out.address === 'Sb9jz3wcMG2v92M4UqdVMxxT4v4XAs4Gjw' && (
                            <span className="badge" style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.3)', fontSize: '0.75rem', padding: '0.15rem 0.4rem' }}>
                              Genesis Premine
                            </span>
                          )}
                        </div>
                        <span className="amount mono">{formatQVNC(out.amount)}</span>
                      </div>
                    </div>
                  ))
                )}
                {changeOutputs.length > 0 ? (
                  <div className="io-change-list">
                    <div className="io-title detail-muted">Change</div>
                    {changeOutputs.map((out: any, index: number) => (
                      <div className="io-item io-item-stacked detail-muted" key={`change:${out.address}:${out.vout_index}:${index}`}>
                        <div className="io-row-main">
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); navigate(`/address/${out.address}`); }}
                            className="mono io-address"
                          >
                            {out.address}
                          </a>
                          <span className="amount mono">{formatQVNC(out.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="loading-box">Indexed input/output breakdown is not available for this transaction yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
