import React, { useEffect, useState } from 'react';
import { fetchJson } from '../utils/fetchJson';
import { formatTime } from '../utils/formatting';
import { Pagination, PageSizeSelect, formatShowingRange } from '../components/Pagination';

type Navigate = (to: string) => void;

export default function MovementsView({ navigate }: { navigate: (to: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadMovements = async () => {
    setLoading(true);
    setError(false);
    const json = await fetchJson<any>(`/api/movements?limit=${limit}&offset=${offset}`, null);
    if (json && json.items) {
      setData(json);
    } else {
      setError(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMovements();
  }, [offset, limit]);

  if (loading && !data) return <div className="loading-box">Loading movements...</div>;
  if (error || !data) {
    return (
      <div className="error-box">
        Could not retrieve movements. Verify the Express API server is running on port 3039.
      </div>
    );
  }

  const items = data?.items ?? [];
  const total = data?.pagination?.total ?? 0;
  const showingRange = formatShowingRange(offset, limit, total, items.length);

  const handlePageSizeChange = (value: number) => {
    setLimit(value);
    setOffset(0);
  };

  if (items.length === 0) {
    return (
      <div className="no-results-box" style={{ marginTop: '2rem' }}>
        <h2>No movements found</h2>
        <p style={{ marginTop: '1rem', color: '#94a3b8' }}>
          No address movements recorded in the database yet.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header panel-header-stacked">
        <div className="panel-heading-row">
          <div className="panel-heading-main">
            <h3 className="panel-title">Latest Movements</h3>
            <p className="panel-description">Recent address-level QVNC movements</p>
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
              <th>Time</th>
              <th>Address</th>
              <th>Direction</th>
              <th>Amount</th>
              <th>Tx</th>
              <th>Block</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={idx}>
                <td className="timestamp">{formatTime(item.time)}</td>
                <td className="cell-mono-full">
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/address/${item.address}`); }} className="hash">
                    {item.address}
                  </a>
                </td>
                <td>
                  <span className={`badge ${item.direction === 'received' ? 'in' : 'out'}`}>
                    {item.direction === 'received' ? 'Received' : 'Sent'}
                  </span>
                </td>
                <td className={`amount mono ${item.direction === 'received' ? 'amount-in' : 'amount-out'}`}>
                  {item.amountFormatted}
                </td>
                <td className="cell-mono-full">
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/tx/${item.txid}`); }} className="hash">
                    {item.txid}
                  </a>
                </td>
                <td>
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/block/${item.blockHeight}`); }}>
                    {item.blockHeight}
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
