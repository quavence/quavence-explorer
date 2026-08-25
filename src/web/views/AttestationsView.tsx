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
  const type = (taskType || '').toUpperCase().replace('TASK_', '').replace('BOUNTY', 'TASK');
  if (type === 'RAG') {
    return {
      label: 'RAG',
      style: { backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' },
    };
  }
  if (type === 'GOVERNANCE') {
    return {
      label: 'GOVERNANCE',
      style: { backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' },
    };
  }
  if (type === 'TASK') {
    return {
      label: 'TASK',
      style: { backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)' },
    };
  }
  return {
    label: type || 'AI_INFERENCE',
    style: { backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155' },
  };
}

export default function AttestationsView({ navigate }: { navigate: Navigate }) {
  const [data, setData] = useState<any>(null);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);

  const loadAttestations = async () => {
    setLoading(true);
    const json = await fetchJson<any>(`/api/attestations?limit=${limit}&offset=${offset}`, null);
    setData(json);
    setLoading(false);
  };

  useEffect(() => {
    loadAttestations();
  }, [offset, limit]);

  if (loading && !data) return <div className="loading-box">Loading attestations...</div>;
  if (!data) {
    return (
      <div className="error-box">
        Could not retrieve AI attestations. Verify the Express API server is running on port 3039.
      </div>
    );
  }

  const total = data?.total ?? 0;
  const items: Attestation[] = data?.attestations ?? [];
  const showingRange = formatShowingRange(offset, limit, total, items.length);

  const handlePageSizeChange = (value: number) => {
    setLimit(value);
    setOffset(0);
  };

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
              <th>Task ID</th>
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
                <td className="mono" style={{ color: '#94a3b8', fontSize: '0.85rem' }} title={att.task_id}>
                  {att.task_id ? (att.task_id.length > 12 ? `${att.task_id.slice(0, 8)}...` : att.task_id) : '—'}
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
