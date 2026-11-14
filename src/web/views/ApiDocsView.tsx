import React, { useState } from 'react';

interface EndpointParam {
  name: string;
  in: 'path' | 'query' | 'body';
  required: boolean;
  type: string;
  description: string;
  default?: string;
}

interface EndpointDef {
  id: string;
  category: 'supply' | 'address' | 'tx' | 'network';
  method: 'GET' | 'POST';
  path: string;
  summary: string;
  description: string;
  params?: EndpointParam[];
  bodyExample?: string;
  curlExample: string;
  responseType: string;
  responseExample: string;
}

const ENDPOINTS: EndpointDef[] = [
  {
    id: 'supply-circulating',
    category: 'supply',
    method: 'GET',
    path: '/api/v1/supply/circulating',
    summary: 'Circulating QVNC supply',
    description: 'Calculated strictly from the verified on-chain UTXO set. Defaults to plain text numeric output for institutional scrapers and indexers.',
    params: [
      {
        name: 'format',
        in: 'query',
        required: false,
        type: 'string',
        default: 'text',
        description: 'Output format: "text" (default) or "json"',
      },
    ],
    curlExample: 'curl -s "https://explorer.quavence.com/api/v1/supply/circulating"\n\n# Or with JSON payload:\ncurl -s "https://explorer.quavence.com/api/v1/supply/circulating?format=json"',
    responseType: 'text/plain or application/json',
    responseExample: `51456.95813140

// JSON format (?format=json):
{
  "circulating": 5145695813140,
  "circulatingFormatted": "51456.95813140"
}`,
  },
  {
    id: 'supply-total',
    category: 'supply',
    method: 'GET',
    path: '/api/v1/supply/total',
    summary: 'Total emitted QVNC supply',
    description: 'Returns total emitted coins up to the current synchronized block height.',
    params: [
      {
        name: 'format',
        in: 'query',
        required: false,
        type: 'string',
        default: 'text',
        description: 'Output format: "text" (default) or "json"',
      },
    ],
    curlExample: 'curl -s "https://explorer.quavence.com/api/v1/supply/total"',
    responseType: 'text/plain or application/json',
    responseExample: `51456.95813140

// JSON format (?format=json):
{
  "total": 5145695813140,
  "totalFormatted": "51456.95813140"
}`,
  },
  {
    id: 'supply-max',
    category: 'supply',
    method: 'GET',
    path: '/api/v1/supply/max',
    summary: 'Protocol hard cap maximum supply',
    description: 'Returns the protocol maximum hard cap (250,000.00000000 QVNC).',
    curlExample: 'curl -s "https://explorer.quavence.com/api/v1/supply/max"',
    responseType: 'text/plain or application/json',
    responseExample: `250000.00000000

// JSON format (?format=json):
{
  "max": 25000000000000,
  "maxFormatted": "250000.00000000"
}`,
  },
  {
    id: 'address-validate',
    category: 'address',
    method: 'GET',
    path: '/api/v1/address/{address}/validate',
    summary: 'Cryptographic address validation',
    description: 'Validates Base58Check encoding, P2PKH protocol version byte (0x3f / "S"), and payload checksum.',
    params: [
      {
        name: 'address',
        in: 'path',
        required: true,
        type: 'string',
        description: 'Quavence Base58Check address to validate',
      },
    ],
    curlExample: 'curl -s "https://explorer.quavence.com/api/v1/address/SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd/validate"',
    responseType: 'application/json',
    responseExample: `{
  "valid": true,
  "address": "SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd",
  "type": "pubkeyhash"
}`,
  },
  {
    id: 'address-balance',
    category: 'address',
    method: 'GET',
    path: '/api/v1/address/{address}/balance',
    summary: 'Address confirmed balance inquiry',
    description: 'Returns authoritative confirmed balance in integer satoshis and formatted 8-decimal string.',
    params: [
      {
        name: 'address',
        in: 'path',
        required: true,
        type: 'string',
        description: 'Quavence Base58Check address',
      },
    ],
    curlExample: 'curl -s "https://explorer.quavence.com/api/v1/address/SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd/balance"',
    responseType: 'application/json',
    responseExample: `{
  "address": "SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd",
  "balance": 1560000,
  "balanceFormatted": "0.01560000",
  "received": 1560000,
  "receivedFormatted": "0.01560000",
  "sent": 0,
  "sentFormatted": "0.00000000",
  "txCount": 14
}`,
  },
  {
    id: 'address-utxo',
    category: 'address',
    method: 'GET',
    path: '/api/v1/address/{address}/utxo',
    summary: 'Address UTXO set inspection',
    description: 'Returns confirmed unspent transaction outputs (UTXO) required for wallet transaction construction.',
    params: [
      {
        name: 'address',
        in: 'path',
        required: true,
        type: 'string',
        description: 'Quavence Base58Check address',
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        type: 'integer',
        default: '100',
        description: 'Maximum UTXOs to return (1-500)',
      },
    ],
    curlExample: 'curl -s "https://explorer.quavence.com/api/v1/address/SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd/utxo?limit=50"',
    responseType: 'application/json',
    responseExample: `{
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
    path: '/api/v1/tx/{txid}',
    summary: 'Transaction status and confirmation lookup',
    description: 'Retrieves transaction status, block height, confirmation count, inputs, outputs, and fees.',
    params: [
      {
        name: 'txid',
        in: 'path',
        required: true,
        type: 'string',
        description: '64-character hex transaction ID',
      },
    ],
    curlExample: 'curl -s "https://explorer.quavence.com/api/v1/tx/fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff"',
    responseType: 'application/json',
    responseExample: `{
  "txid": "fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff",
  "blockHash": "00000000000000000001a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3",
  "blockHeight": 36890,
  "time": 1700000000,
  "type": "pos_stake",
  "amount": 1560000,
  "amountFormatted": "0.01560000",
  "fee": 0,
  "confirmations": 18
}`,
  },
  {
    id: 'tx-broadcast',
    category: 'tx',
    method: 'POST',
    path: '/api/v1/tx/broadcast',
    summary: 'Raw transaction broadcast',
    description: 'Submits a signed raw transaction hex to the Quavence L1 mempool and peer-to-peer network.',
    bodyExample: '{\n  "rawtx": "0100000001..."\n}',
    curlExample: 'curl -s -X POST "https://explorer.quavence.com/api/v1/tx/broadcast" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"rawtx": "0100000001..."}\'',
    responseType: 'application/json',
    responseExample: `{
  "success": true,
  "txid": "fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff"
}`,
  },
  {
    id: 'fee-estimate',
    category: 'network',
    method: 'GET',
    path: '/api/v1/fee/estimate',
    summary: 'Relay fee rate estimation',
    description: 'Returns network relay fee requirements in satoshis per byte and QVNC per kilobyte.',
    curlExample: 'curl -s "https://explorer.quavence.com/api/v1/fee/estimate"',
    responseType: 'application/json',
    responseExample: `{
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
    summary: 'L1 node synchronization status',
    description: 'Returns current synchronized block height, tip hash, median time, peer count, and protocol ticker.',
    curlExample: 'curl -s "https://explorer.quavence.com/api/v1/status"',
    responseType: 'application/json',
    responseExample: `{
  "height": 36910,
  "bestblockhash": "00000000000000000004f1a2...",
  "time": 1763108000,
  "connections": 8,
  "synchronized": true,
  "ticker": "QVNC"
}`,
  },
];

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 13, height: 13 }}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 13, height: 13 }}>
      <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 12, height: 12 }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="15 3 21 3 21 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="10" y1="14" x2="21" y2="3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ApiDocsView({ navigate }: { navigate: (to: string) => void }) {
  const [activeCategory, setActiveCategory] = useState<'all' | 'supply' | 'address' | 'tx' | 'network'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  const filteredEndpoints = ENDPOINTS.filter((ep) => {
    if (activeCategory === 'all') return true;
    return ep.category === activeCategory;
  });

  return (
    <div className="panel">
      {/* Top Header */}
      <div className="panel-header panel-header-stacked">
        <div className="panel-heading-row">
          <div className="panel-heading-main">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h3 className="panel-title">Public API Specification</h3>
              <span className="block-type-pill" style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
                v1.0.0 Mainnet
              </span>
            </div>
            <p className="panel-description">
              Standardized high-performance REST API suite for network indexing, supply verification, address balances, and transaction broadcast on Quavence L1.
            </p>
          </div>

          <div className="panel-heading-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <a
              href="/api/openapi.json"
              target="_blank"
              rel="noopener noreferrer"
              className="node-copy-btn"
              title="Open raw OpenAPI 3.0.3 specification JSON"
            >
              <ExternalIcon />
              <span>OpenAPI 3.0 Spec</span>
            </a>
          </div>
        </div>
      </div>

      {/* Protocol Invariants Bar */}
      <div style={{
        padding: '0.85rem 1.25rem',
        background: 'rgba(15, 23, 42, 0.45)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '0.75rem',
        fontSize: '0.8rem',
      }}>
        <div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Base Endpoint URL
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 600 }}>
              https://explorer.quavence.com/api/v1
            </span>
            <button
              type="button"
              className={`node-copy-btn ${copiedKey === 'base-url' ? 'copied' : ''}`}
              style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
              onClick={() => handleCopy('https://explorer.quavence.com/api/v1', 'base-url')}
              title="Copy base URL"
            >
              {copiedKey === 'base-url' ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        </div>

        <div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Precision Standard
          </div>
          <div style={{ marginTop: '0.2rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Exact integer satoshis (1 QVNC = 100,000,000 sats)
          </div>
        </div>

        <div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Rate Limits
          </div>
          <div style={{ marginTop: '0.2rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            General: 120 req/min · Heavy: 30 req/min
          </div>
        </div>

        <div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Data Source (SSOT)
          </div>
          <div style={{ marginTop: '0.2rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span className="pane-status-dot" style={{ width: 6, height: 6 }}></span>
            Quavence L1 UTXO Core Engine
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-header)' }}>
        <div className="nodes-tab-group" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`nodes-tab-btn ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All Endpoints
            <span className="nodes-tab-badge">{ENDPOINTS.length}</span>
          </button>
          <button
            type="button"
            className={`nodes-tab-btn ${activeCategory === 'supply' ? 'active' : ''}`}
            onClick={() => setActiveCategory('supply')}
          >
            Supply
            <span className="nodes-tab-badge">{ENDPOINTS.filter(e => e.category === 'supply').length}</span>
          </button>
          <button
            type="button"
            className={`nodes-tab-btn ${activeCategory === 'address' ? 'active' : ''}`}
            onClick={() => setActiveCategory('address')}
          >
            Address &amp; UTXO
            <span className="nodes-tab-badge">{ENDPOINTS.filter(e => e.category === 'address').length}</span>
          </button>
          <button
            type="button"
            className={`nodes-tab-btn ${activeCategory === 'tx' ? 'active' : ''}`}
            onClick={() => setActiveCategory('tx')}
          >
            Transactions
            <span className="nodes-tab-badge">{ENDPOINTS.filter(e => e.category === 'tx').length}</span>
          </button>
          <button
            type="button"
            className={`nodes-tab-btn ${activeCategory === 'network' ? 'active' : ''}`}
            onClick={() => setActiveCategory('network')}
          >
            Network
            <span className="nodes-tab-badge">{ENDPOINTS.filter(e => e.category === 'network').length}</span>
          </button>
        </div>
      </div>

      {/* Endpoints List */}
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {filteredEndpoints.map((ep) => {
          const isGet = ep.method === 'GET';
          const copyKeyCurl = `curl-${ep.id}`;
          const copyKeyPath = `path-${ep.id}`;

          return (
            <div
              key={ep.id}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {/* Endpoint Header Bar */}
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      backgroundColor: isGet ? 'rgba(56, 189, 248, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                      color: isGet ? '#38bdf8' : '#34d399',
                      border: `1px solid ${isGet ? 'rgba(56, 189, 248, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                    }}
                  >
                    {ep.method}
                  </span>

                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      color: '#ffffff',
                    }}
                  >
                    {ep.path}
                  </span>

                  <button
                    type="button"
                    className={`node-copy-btn ${copiedKey === copyKeyPath ? 'copied' : ''}`}
                    style={{ padding: '0.15rem 0.45rem', fontSize: '0.7rem' }}
                    onClick={() => handleCopy(ep.path, copyKeyPath)}
                    title="Copy endpoint path"
                  >
                    {copiedKey === copyKeyPath ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {ep.summary}
                </div>
              </div>

              {/* Endpoint Body */}
              <div style={{ padding: '1rem' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginBottom: '0.85rem' }}>
                  {ep.description}
                </p>

                {/* Parameters Table if any */}
                {ep.params && ep.params.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                      Parameters
                    </div>
                    <div className="table-responsive">
                      <table className="dense-table" style={{ fontSize: '0.78rem' }}>
                        <thead>
                          <tr>
                            <th style={{ width: '130px' }}>Name</th>
                            <th style={{ width: '80px' }}>Type</th>
                            <th style={{ width: '80px' }}>In</th>
                            <th style={{ width: '90px' }}>Required</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ep.params.map((p) => (
                            <tr key={p.name}>
                              <td style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 600 }}>{p.name}</td>
                              <td style={{ color: 'var(--text-dim)' }}>{p.type}</td>
                              <td><span className="block-type-pill">{p.in}</span></td>
                              <td>
                                {p.required ? (
                                  <span style={{ color: '#f87171', fontWeight: 600 }}>required</span>
                                ) : (
                                  <span style={{ color: 'var(--text-dim)' }}>optional</span>
                                )}
                              </td>
                              <td style={{ color: 'var(--text-secondary)' }}>
                                {p.description} {p.default ? <code style={{ color: 'var(--text-muted)' }}>(default: {p.default})</code> : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Request Body if POST */}
                {ep.bodyExample && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                      Request Payload (JSON)
                    </div>
                    <pre style={{
                      backgroundColor: '#050811',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      padding: '0.65rem 0.85rem',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                      color: '#cbd5e1',
                      overflowX: 'auto',
                    }}>
                      {ep.bodyExample}
                    </pre>
                  </div>
                )}

                {/* cURL Example Block */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.35rem',
                  }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      cURL Request Example
                    </span>
                    <button
                      type="button"
                      className={`node-copy-btn ${copiedKey === copyKeyCurl ? 'copied' : ''}`}
                      onClick={() => handleCopy(ep.curlExample, copyKeyCurl)}
                      title="Copy cURL command"
                    >
                      {copiedKey === copyKeyCurl ? (
                        <>
                          <CheckIcon /> <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon /> <span>Copy cURL</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre style={{
                    backgroundColor: '#050811',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.78rem',
                    fontFamily: 'var(--font-mono)',
                    color: '#93c5fd',
                    overflowX: 'auto',
                    margin: 0,
                  }}>
                    {ep.curlExample}
                  </pre>
                </div>

                {/* Response Preview */}
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.35rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Response Preview
                      </span>
                      <span className="block-type-pill" style={{ color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.3)' }}>
                        200 OK
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      {ep.responseType}
                    </span>
                  </div>

                  <pre style={{
                    backgroundColor: '#060a14',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '0.75rem 0.85rem',
                    fontSize: '0.78rem',
                    fontFamily: 'var(--font-mono)',
                    color: '#cbd5e1',
                    overflowX: 'auto',
                    margin: 0,
                    lineHeight: 1.45,
                  }}>
                    {ep.responseExample}
                  </pre>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
