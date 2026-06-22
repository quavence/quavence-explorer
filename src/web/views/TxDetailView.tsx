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
  const isCoinbaseLike = tx?.type === 'stake_reward' || tx?.type === 'coinbase' || tx?.type === 'bootstrap';
  const hasIndexedIo = contributors.length > 0 || recipients.length > 0;

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
                    <span style={{ color: '#34d399', fontWeight: 'bold' }}>Matured (Spendable)</span>
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
          <div className="detail-row">
            <div className="detail-label">Input total</div>
            <div className="detail-value mono">
              {tx?.input_total > 0 ? formatQVNC(tx.input_total) : (isCoinbaseLike ? 'Coinbase / PoS' : '—')}
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Output total</div>
            <div className="detail-value mono">{formatQVNC(tx?.output_total ?? 0)}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Fee</div>
            <div className="detail-value mono">{formatQVNC(tx?.fee ?? 0)}</div>
          </div>
        </div>
      </div>

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
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); navigate(`/address/${input.address}`); }}
                        className="mono"
                      >
                        {input.address}
                      </a>
                      <span className="detail-muted mono">
                        prevout{' '}
                        <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/tx/${input.prev_txid}`); }}>
                          {shortenHash(input.prev_txid)}
                        </a>
                        :{input.prev_vout_index}
                      </span>
                      <span className="amount mono io-input-amount">{formatQVNC(input.amount)}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="io-arrow">→</div>

              <div className="io-column">
                <div className="io-title">Recipients</div>
                {recipients.length === 0 ? (
                  <div className="io-item">
                    <span style={{ color: '#64748b' }}>No indexed outputs</span>
                  </div>
                ) : (
                  recipients.map((out: any, index: number) => (
                    <div className="io-item" key={`${out.address}:${out.vout_index}:${index}`}>
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); navigate(`/address/${out.address}`); }}
                        className="mono"
                      >
                        {out.address}
                      </a>
                      <span className="amount mono">{formatQVNC(out.amount)}</span>
                    </div>
                  ))
                )}
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
