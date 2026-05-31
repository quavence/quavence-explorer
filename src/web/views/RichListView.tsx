import React, { useEffect, useState } from 'react';
import { fetchJson } from '../utils/fetchJson';
import { formatShowingRange } from '../components/Pagination';

type Navigate = (to: string) => void;

export default function RichListView({ navigate }: { navigate: (to: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadRichList = async () => {
    setLoading(true);
    setError(false);
    try {
      const json = await fetchJson<any>('/api/richlist?limit=100', null);
      if (json && json.items) {
        setData(json);
      } else {
        setError(true);
      }
    } catch (err) {
      setError(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRichList();
  }, []);

  if (loading && !data) return <div className="loading-box">Loading rich list...</div>;
  if (error || !data) {
    return (
      <div className="error-box">
        Could not retrieve rich list. Verify the Express API server is running on port 3039.
      </div>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? items.length;
  const showingRange = formatShowingRange(0, 100, total, items.length);

  if (items.length === 0) {
    return (
      <div className="no-results-box" style={{ marginTop: '2rem' }}>
        <h2>No addresses with balance found</h2>
        <p style={{ marginTop: '1rem', color: '#94a3b8' }}>
          The rich list is empty. Start the indexer to populate address data.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header panel-header-stacked">
        <div className="panel-heading-row">
          <div className="panel-heading-main">
            <h3 className="panel-title">Top 100 Addresses</h3>
            <p className="panel-description">Largest QVNC holders by current balance</p>
          </div>
          <div className="panel-heading-actions">
            <span className="result-summary">{showingRange}</span>
          </div>
        </div>
      </div>
      <div className="table-responsive sticky-headers">
        <table className="dense-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Address</th>
              <th>Balance</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.rank}>
                <td className="mono">{item.rank}</td>
                <td>
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/address/${item.address}`); }} className="hash">
                    {item.address.substring(0, 8) + '...' + item.address.substring(item.address.length - 8)}
                  </a>
                </td>
                <td className="amount mono">{item.balanceFormatted}</td>
                <td className="mono">{item.supplyShare.toFixed(2)}%</td>
              </tr>
            ))}
</tbody>
         </table>
       </div>
     </div>
   );
}


