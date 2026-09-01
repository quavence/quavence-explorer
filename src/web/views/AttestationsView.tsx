import React, { useEffect, useState } from 'react';
import { fetchJson } from '../utils/fetchJson';
import { formatTime, shortenHash } from '../utils/formatting';
import { Pagination, PageSizeSelect, formatShowingRange } from '../components/Pagination';

type Navigate = (to: string) => void;

interface Attestation {
  txid: string;
  block_hash: string;
  block_height: number;
  block_time?: number;
  task_id?: string;
  task_type: string;
  consensus_hash: string;
  worker_count: number;
  agreement_ratio: number;
  ref_block_height: number;
  created_at: string | number;
}

function getTaskTypeBadge(taskType: string) {
  const raw = (taskType || '').toUpperCase().trim();
  let label = raw.replace('TASK_', '') || 'CONSENSUS';

  if (raw.includes('SUMMARY') || raw.includes('DIGEST') || raw === 'TASK') {
    label = 'DIGEST';
  } else if (raw.includes('RISK') || raw.includes('FLAGS')) {
    label = 'RISK AUDIT';
  } else if (raw.includes('GOVERNANCE') || raw.includes('PROPOSAL')) {
    label = 'GOVERNANCE';
  } else if (raw.includes('RAG') || raw.includes('IDLE') || raw.includes('KNOWLEDGE')) {
    label = 'RAG VERIFICATION';
  } else if (raw.includes('HISTOR')) {
    label = 'HISTORY CONTEXT';
  } else if (raw.includes('OUTCOME') || raw.includes('RECAP')) {
    label = 'OUTCOME RECAP';
  } else if (raw.includes('COMPOSER')) {
    label = 'BOUNTY COMPOSER';
  } else if (raw.includes('REVIEW') || raw.includes('CONSULTANT')) {
    label = 'REVIEW CONSULTANT';
  } else if (raw.includes('SCREEN') || raw.includes('SUBMISSION') || raw.includes('BOUNTY')) {
    label = 'SUBMISSION SCREEN';
  }

  return {
    label,
    style: {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      color: '#cbd5e1',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      fontSize: '0.72rem',
      fontWeight: 500,
      letterSpacing: '0.05em',
      padding: '3px 8px',
      borderRadius: '4px',
    },
  };
}

export default function AttestationsView({ navigate }: { navigate: Navigate }) {
  const [data, setData] = useState<any>(null);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchJson<any>(`/api/attestations?limit=${limit}&offset=${offset}`, null)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load AI attestations');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [offset, limit]);

  const handlePageSizeChange = (newSize: number) => {
    setLimit(newSize);
    setOffset(0);
  };

  if (loading && !data) {
    return (
      <div className="panel">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-row">
            <div className="panel-heading-main">
              <h3 className="panel-title">AI Attestations</h3>
              <p className="panel-description">PoUS on-chain consensus proof records</p>
            </div>
          </div>
        </div>
        <div className="loading-box" style={{ padding: '3rem 1rem' }}>
          <div className="spinner" />
          <p style={{ marginTop: '1rem', color: '#94a3b8' }}>Loading on-chain AI attestations...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="panel">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-row">
            <div className="panel-heading-main">
              <h3 className="panel-title">AI Attestations</h3>
              <p className="panel-description">PoUS on-chain consensus proof records</p>
            </div>
          </div>
        </div>
        <div className="error-box" style={{ padding: '2rem 1rem' }}>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const items: Attestation[] = data?.attestations || [];
  const total = data?.total || 0;
  const showingRange = formatShowingRange(offset, limit, total, items.length);

  if (items.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-row">
            <div className="panel-heading-main">
              <h3 className="panel-title">AI Attestations (0)</h3>
              <p className="panel-description">PoUS on-chain consensus proof records</p>
            </div>
          </div>
        </div>
        <div className="no-results-box" style={{ padding: '3rem 1rem' }}>
          <h2>No AI Attestations Found</h2>
          <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>
            No Proof-of-Useful-Stake consensus proofs have been anchored in recent blocks yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header panel-header-stacked">
        <div className="panel-heading-row">
          <div className="panel-heading-main">
            <h3 className="panel-title">AI Attestations ({total})</h3>
            <p className="panel-description">PoUS on-chain consensus proof records</p>
          </div>
          <div className="panel-heading-actions">
            <span className="result-summary">{showingRange}</span>
            <PageSizeSelect value={limit} onChange={handlePageSizeChange} />
          </div>
        </div>
      </div>
      <div className="table-responsive sticky-headers">
        <table className="dense-table">
          <thead>
            <tr>
              <th>Height</th>
              <th>Time</th>
              <th>Task Type</th>
              <th>Consensus Hash</th>
              <th>Workers</th>
              <th>Agreement</th>
              <th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {items.map((att) => (
              <tr key={att.txid}>
                <td>
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${att.block_height}`); }} className="hash">
                    {att.block_height}
                  </a>
                </td>
                <td className="timestamp">
                  {formatTime(att.block_time || att.created_at)}
                </td>
                <td>
                  {(() => {
                    const badge = getTaskTypeBadge(att.task_type);
                    return (
                      <span className="badge" style={badge.style}>
                        {badge.label}
                      </span>
                    );
                  })()}
                </td>
                <td className="mono" style={{ color: '#a3b1bf', fontSize: '0.85rem' }} title={att.consensus_hash}>
                  {shortenHash(att.consensus_hash || '')}
                </td>
                <td className="mono" style={{ textAlign: 'center' }}>
                  {att.worker_count || 1}
                </td>
                <td className="mono" style={{ color: '#4ade80', fontWeight: 600 }}>
                  {((att.agreement_ratio || 1) * 100).toFixed(0)}%
                </td>
                <td className="cell-mono-full">
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/tx/${att.txid}`); }} className="hash">
                    {shortenHash(att.txid)}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination limit={limit} offset={offset} total={total} onPageChange={setOffset} />
    </div>
  );
}
