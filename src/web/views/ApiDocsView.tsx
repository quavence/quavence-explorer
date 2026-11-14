import React, { useState } from 'react';

type ApiCategory = 'all' | 'supply' | 'address' | 'tx' | 'network';

interface EndpointItem {
  id: string;
  category: 'supply' | 'address' | 'tx' | 'network';
  method: 'GET' | 'POST';
  path: string;
  description: string;
  params: string;
  curl: string;
  response: string;
}

const ENDPOINTS: EndpointItem[] = [
  {
    id: 'supply-circulating',
    category: 'supply',
    method: 'GET',
    path: '/api/v1/supply/circulating',
    description: 'Circulating QVNC supply calculated strictly from on-chain UTXO set',
    params: '?format=json (optional)',
    curl: 'curl -s "https://explorer.quavence.com/api/v1/supply/circulating"',
    response: `51457.19813140

// With ?format=json:
{
  "circulating": 5145719813140,
  "circulatingFormatted": "51457.19813140"
}`,
  },
  {
    id: 'supply-total',
    category: 'supply',
    method: 'GET',
    path: '/api/v1/supply/total',
    description: 'Total emitted coins up to current synchronized block height',
    params: '?format=json (optional)',
    curl: 'curl -s "https://explorer.quavence.com/api/v1/supply/total"',
    response: `51457.19813140

// With ?format=json:
{
  "total": 5145719813140,
  "totalFormatted": "51457.19813140"
}`,
  },
  {
    id: 'supply-max',
    category: 'supply',
    method: 'GET',
    path: '/api/v1/supply/max',
    description: 'Hard-coded protocol maximum supply limit (250,000 QVNC)',
    params: 'none',
    curl: 'curl -s "https://explorer.quavence.com/api/v1/supply/max"',
    response: `250000.00000000

// With ?format=json:
{
  "max": 25000000000000,
  "maxFormatted": "250000.00000000"
}`,
  },
  {
    id: 'address-validate',
    category: 'address',
    method: 'GET',
    path: '/api/v1/address/:address/validate',
    description: 'Cryptographic Base58Check and P2PKH checksum verification',
    params: ':address (path)',
    curl: 'curl -s "https://explorer.quavence.com/api/v1/address/SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd/validate"',
    response: `{
  "valid": true,
  "address": "SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd",
  "type": "pubkeyhash"
}`,
  },
  {
    id: 'address-balance',
    category: 'address',
    method: 'GET',
    path: '/api/v1/address/:address/balance',
    description: 'Authoritative confirmed address balance and transaction count',
    params: ':address (path)',
    curl: 'curl -s "https://explorer.quavence.com/api/v1/address/SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd/balance"',
    response: `{
  "address": "SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd",
  "balance": 1560000,
  "balanceFormatted": "0.01560000",
  "txCount": 14
}`,
  },
  {
    id: 'address-utxo',
    category: 'address',
    method: 'GET',
    path: '/api/v1/address/:address/utxo',
    description: 'Unspent transaction outputs (UTXO) required for wallet transaction construction',
    params: ':address (path), ?limit=50 (1-500)',
    curl: 'curl -s "https://explorer.quavence.com/api/v1/address/SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd/utxo?limit=50"',
    response: `{
  "address": "SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd",
  "count": 1,
  "totalAmount": 1560000,
  "totalAmountFormatted": "0.01560000",
  "utxos": [
    {
      "txid": "fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff",
      "vout": 1,
      "amount": 1560000,
      "amountFormatted": "0.01560000",
      "height": 36890,
      "confirmations": 18
    }
  ]
}`,
  },
  {
    id: 'tx-lookup',
    category: 'tx',
    method: 'GET',
    path: '/api/v1/tx/:txid',
    description: 'Transaction confirmation status, block height, inputs, outputs, and fees',
    params: ':txid (path)',
    curl: 'curl -s "https://explorer.quavence.com/api/v1/tx/fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff"',
    response: `{
  "txid": "fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff",
  "blockHeight": 36890,
  "type": "pos_stake",
  "amount": 1560000,
  "amountFormatted": "0.01560000",
  "confirmations": 18
}`,
  },
  {
    id: 'tx-broadcast',
    category: 'tx',
    method: 'POST',
    path: '/api/v1/tx/broadcast',
    description: 'Broadcast signed raw transaction hex to L1 mempool and peer-to-peer network',
    params: 'body: { "rawtx": "<hex>" }',
    curl: 'curl -s -X POST "https://explorer.quavence.com/api/v1/tx/broadcast" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"rawtx": "0100000001..."}\'',
    response: `{
  "success": true,
  "txid": "fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff"
}`,
  },
  {
    id: 'fee-estimate',
    category: 'network',
    method: 'GET',
    path: '/api/v1/fee/estimate',
    description: 'Network relay fee requirements in sat/byte and sat/kb',
    params: 'none',
    curl: 'curl -s "https://explorer.quavence.com/api/v1/fee/estimate"',
    response: `{
  "sat_per_byte": 1,
  "sat_per_kb": 1000,
  "fee_per_kb": 0.00001
}`,
  },
  {
    id: 'network-status',
    category: 'network',
    method: 'GET',
    path: '/api/v1/status',
    description: 'L1 node synchronization height, tip hash, median time, and ticker',
    params: 'none',
    curl: 'curl -s "https://explorer.quavence.com/api/v1/status"',
    response: `{
  "height": 36910,
  "bestblockhash": "00000000000000000004f1a2...",
  "synced": true,
  "ticker": "QVNC"
}`,
  },
];

export default function ApiDocsView({ navigate }: { navigate: (to: string) => void }) {
  const [category, setCategory] = useState<ApiCategory>('all');
  const [expandedId, setExpandedId] = useState<string | null>('supply-circulating');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  const filtered = ENDPOINTS.filter((ep) => {
    if (category === 'all') return true;
    return ep.category === category;
  });

  return (
    <div className="panel">
      <div className="panel-header panel-header-stacked">
        <div className="panel-heading-row">
          <div className="panel-heading-main">
            <h3 className="panel-title">Public API</h3>
            <p className="panel-description">
              Standardized REST endpoints for Quavence L1 data, balances, and transaction broadcast
            </p>
          </div>
          <div className="panel-heading-actions">
            <div className="filter-pills">
              {(['all', 'supply', 'address', 'tx', 'network'] as ApiCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`filter-pill-btn ${category === cat ? 'active' : ''}`}
                  onClick={() => setCategory(cat)}
                >
                  {cat === 'tx' ? 'TRANSACTIONS' : cat.toUpperCase()}
                </button>
              ))}
            </div>

            <a
              href="/api/openapi.json"
              target="_blank"
              rel="noopener noreferrer"
              className="filter-pill-btn"
              style={{ textDecoration: 'none' }}
              title="Open OpenAPI 3.0.3 specification JSON"
            >
              OPENAPI SPEC
            </a>
          </div>
        </div>
      </div>

      <div className="table-responsive">
        <table className="dense-table">
          <thead>
            <tr>
              <th style={{ width: '70px' }}>Method</th>
              <th style={{ width: '270px' }}>Endpoint</th>
              <th>Description</th>
              <th style={{ width: '180px' }}>Params</th>
              <th style={{ width: '100px', textAlign: 'right', paddingRight: '1rem' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ep) => {
              const isExpanded = expandedId === ep.id;
              const copyKey = `curl-${ep.id}`;
              const isCopied = copiedKey === copyKey;

              return (
                <React.Fragment key={ep.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : ep.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <span className="block-type-pill">
                        {ep.method}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {ep.path}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {ep.description}
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                      {ep.params}
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: '1rem' }}>
                      <button
                        type="button"
                        className={`node-copy-btn ${isCopied ? 'copied' : ''}`}
                        onClick={(e) => handleCopy(ep.curl, copyKey, e)}
                        title="Copy cURL snippet"
                      >
                        {isCopied ? 'Copied' : 'Copy cURL'}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={5} style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--bg-canvas)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                              cURL
                            </div>
                            <pre style={{
                              margin: 0,
                              padding: '0.55rem 0.75rem',
                              backgroundColor: 'var(--bg-surface)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '4px',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.76rem',
                              color: 'var(--text-primary)',
                              overflowX: 'auto',
                            }}>
                              {ep.curl}
                            </pre>
                          </div>

                          <div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                              Response
                            </div>
                            <pre style={{
                              margin: 0,
                              padding: '0.55rem 0.75rem',
                              backgroundColor: 'var(--bg-surface)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '4px',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.76rem',
                              color: 'var(--text-secondary)',
                              overflowX: 'auto',
                              lineHeight: 1.4,
                            }}>
                              {ep.response}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
