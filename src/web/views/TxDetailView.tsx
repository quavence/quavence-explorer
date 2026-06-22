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

  const raw = tx?.raw;
  const isTransfer = tx?.type === 'normal_transfer';
  const outputTotal = Number(tx?.amount_raw_output ?? tx?.amount ?? 0);
  const estimatedNet = Number(tx?.amount_net_transfer || 0);
  const estimatedChange = Number(tx?.change_amount || 0);
  const showEstimated = isTransfer && (estimatedNet > 0 || estimatedChange > 0);

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
              <p className="panel-description">On-chain inputs, outputs, and optional change estimates</p>
            </div>
            <div className="panel-heading-actions">
              <span className={`badge ${tx?.type}`}>{tx?.type ?? 'unknown'}</span>
            </div>
          </div>
        </div>
        <div className="panel-body">
          <div className="detail-row">
            <div className="detail-label">TXID:</div>
            <div className="detail-value mono">{tx?.txid ?? '-'}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Block Hash:</div>
            <div className="detail-value mono">
              {tx?.blockHash ? (
                <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${tx.blockHash}`); }}>
                  {tx.blockHash}
                </a>
              ) : '-'}
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Height:</div>
            <div className="detail-value">
              {tx?.blockHeight ? (
                <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${tx.blockHeight}`); }}>
                  {tx.blockHeight}
                </a>
              ) : '-'}
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Timestamp:</div>
            <div className="detail-value timestamp">{formatTime(tx?.time)}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Confirmations:</div>
            <div className="detail-value">{tx?.confirmations ?? 0}</div>
          </div>
          {tx?.type === 'stake_reward' && (
            <div className="detail-row">
              <div className="detail-label">Maturity Status:</div>
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
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">Input & Output Details</h3>
        </div>
        <div className="panel-body">
          {raw ? (
            <div className="io-grid">
              <div className="io-column">
                <div className="io-title">Inputs</div>
                {(raw?.vin ?? []).map((input: any, index: number) => {
                  if (input.coinbase) {
                    return (
                      <div className="io-item" key={index}>
                        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>Coinbase (New Coins)</span>
                      </div>
                    );
                  }
                  return (
                    <div className="io-item" key={index} style={{ flexDirection: 'column', gap: '0.2rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="mono">
                          Spent prevout: <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/tx/${input.txid}`); }}>{shortenHash(input.txid)}</a> vout {input.vout}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="io-arrow">to</div>

              <div className="io-column">
                <div className="io-title">Outputs</div>
                {(raw?.vout ?? []).map((out: any, index: number) => {
                  let address = '';
                  if (out.scriptPubKey) {
                    if (out.scriptPubKey.address) {
                      address = out.scriptPubKey.address;
                    } else if (Array.isArray(out.scriptPubKey.addresses) && out.scriptPubKey.addresses.length > 0) {
                      address = out.scriptPubKey.addresses[0];
                    }
                  }

                  const valueSat = Math.round(parseFloat(out.value || '0') * 100000000);

                  return (
                    <div className="io-item" key={index}>
                      <span className="mono">
                        {address ? (
                          <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/address/${address}`); }}>
                            {address}
                          </a>
                        ) : tx?.type === 'stake_reward' && valueSat === 0 ? (
                          <span style={{ color: '#64748b' }}>PoS stake marker</span>
                        ) : (
                          <span style={{ color: '#64748b' }}>OP_RETURN / Non-address output</span>
                        )}
                      </span>
                      <span className="amount mono">{formatQVNC(valueSat)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="loading-box">Raw node transaction details unavailable. Showing metadata only.</div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">Amounts</h3>
        </div>
        <div className="panel-body">
          <div className="detail-section-title">On-chain</div>
          <div className="detail-row">
            <div className="detail-label">Output total</div>
            <div className="detail-value mono">{formatQVNC(outputTotal)}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Fee</div>
            <div className="detail-value mono">{formatQVNC(tx?.fee_amount ?? tx?.fee)}</div>
          </div>
          {showEstimated ? (
            <>
              <div className="detail-section-title detail-subsection-title">Estimated analytics</div>
              <div className="detail-row">
                <div className="detail-label">Est. net to recipients</div>
                <div className="detail-value mono">
                  {estimatedNet > 0 ? formatQVNC(estimatedNet) : '—'}
                  {tx?.amount_confidence && tx.amount_confidence !== 'exact' ? (
                    <span className="badge amount-confidence">{tx.amount_confidence}</span>
                  ) : null}
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Est. change</div>
                <div className="detail-value mono detail-muted">
                  {estimatedChange > 0 ? formatQVNC(estimatedChange) : '—'}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
