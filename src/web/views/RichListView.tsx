import React, { useEffect, useState } from 'react';
import { fetchJson } from '../utils/fetchJson';
import { formatShowingRange } from '../components/Pagination';
import { getKnownAddressTag } from '../utils/knownAddresses';
import LoadingState from '../components/LoadingState';

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

  if (loading && !data) return <LoadingState message="Loading top 100 rich list..." />;
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
            <p className="panel-description">Largest QVNC holders by current unspent UTXO balance</p>
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
              <th style={{ width: '60px' }}>#</th>
              <th>Address / Label</th>
              <th className="col-amount" style={{ textAlign: 'right', width: '240px' }}>Balance</th>
              <th style={{ textAlign: 'right', width: '120px', paddingRight: '1.25rem' }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => {
              const tag = getKnownAddressTag(item.address);
              return (
                <tr key={item.rank}>
                  <td className="mono">{item.rank}</td>
                  <td className="cell-mono-full">
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/address/${item.address}`); }} className="hash">
                        {item.address}
                      </a>
                      {tag && (
                        <span style={tag.badgeStyle} title={tag.description}>
                          {tag.badgeText}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="col-amount mono" style={{ textAlign: 'right' }}>{item.balanceFormatted}</td>
                  <td className="mono" style={{ textAlign: 'right', paddingRight: '1.25rem' }}>{item.supplyShare.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
