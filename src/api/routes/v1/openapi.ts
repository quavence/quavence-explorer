import { Router, Request, Response } from 'express';

const router = Router();

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Quavence Protocol Public API Specification',
    version: '1.0.0',
    description:
      'Standardized high-performance public REST API suite for network indexing, supply verification, address balances, and transaction broadcast on Quavence L1.',
    contact: {
      name: 'Quavence Protocol Core Team',
      url: 'https://quavence.org',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'Quavence Explorer Public API v1',
    },
  ],
  tags: [
    { name: 'Supply', description: 'Circulating, total and maximum supply verification endpoints' },
    { name: 'Address', description: 'Address validation, balance inquiries and UTXO set inspection' },
    { name: 'Transaction', description: 'Transaction confirmation lookup and raw transaction broadcast' },
    { name: 'Network', description: 'Fee rate estimation and node synchronization status' },
  ],
  paths: {
    '/supply/circulating': {
      get: {
        tags: ['Supply'],
        summary: 'Circulating QVNC supply',
        description: 'Returns the circulating supply calculated from on-chain UTXO set. Defaults to text/plain for CoinMarketCap and CoinGecko robots.',
        parameters: [
          {
            name: 'format',
            in: 'query',
            description: 'Optional output format: "text" (default) or "json"',
            required: false,
            schema: { type: 'string', enum: ['text', 'json'], default: 'text' },
          },
        ],
        responses: {
          '200': {
            description: 'Circulating supply value',
            content: {
              'text/plain': {
                schema: { type: 'string', example: '51456.35813140' },
              },
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    circulating: { type: 'integer', example: 5145635813140 },
                    circulatingFormatted: { type: 'string', example: '51456.35813140' },
                  },
                },
              },
            },
          },
          '503': {
            description: 'UTXO set unindexed or desynchronized',
            content: {
              'text/plain': { schema: { type: 'string', example: 'Service Unavailable: UTXO set desynchronized' } },
              'application/json': { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
    '/supply/total': {
      get: {
        tags: ['Supply'],
        summary: 'Total emitted QVNC supply',
        description: 'Returns total emitted coins up to the current block height.',
        parameters: [
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['text', 'json'], default: 'text' },
          },
        ],
        responses: {
          '200': {
            description: 'Total supply value',
            content: {
              'text/plain': { schema: { type: 'string', example: '51456.35813140' } },
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer', example: 5145635813140 },
                    totalFormatted: { type: 'string', example: '51456.35813140' },
                  },
                },
              },
            },
          },
          '503': {
            description: 'UTXO set unindexed or desynchronized',
            content: {
              'text/plain': { schema: { type: 'string', example: 'Service Unavailable: UTXO set desynchronized' } },
              'application/json': { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
    '/supply/max': {
      get: {
        tags: ['Supply'],
        summary: 'Maximum possible QVNC supply',
        description: 'Returns hard network cap of 250,000 QVNC.',
        parameters: [
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['text', 'json'], default: 'text' },
          },
        ],
        responses: {
          '200': {
            description: 'Hard cap maximum supply',
            content: {
              'text/plain': { schema: { type: 'string', example: '250000.00000000' } },
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    max: { type: 'integer', example: 25000000000000 },
                    maxFormatted: { type: 'string', example: '250000.00000000' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/address/{address}/validate': {
      get: {
        tags: ['Address'],
        summary: 'Validate Quavence address',
        description: 'Validates Base58Check address format against Quavence mainnet version bytes.',
        parameters: [
          {
            name: 'address',
            in: 'path',
            required: true,
            description: 'Base58 address to validate',
            schema: { type: 'string', example: 'SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd' },
          },
        ],
        responses: {
          '200': {
            description: 'Validation result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    valid: { type: 'boolean', example: true },
                    address: { type: 'string', example: 'SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd' },
                    is_valid: { type: 'boolean', example: true },
                    type: { type: 'string', example: 'pubkeyhash' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/address/{address}/balance': {
      get: {
        tags: ['Address'],
        summary: 'Query address balance',
        description: 'Returns confirmed on-chain balance in satoshis and formatted QVNC.',
        parameters: [
          {
            name: 'address',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd' },
          },
        ],
        responses: {
          '200': {
            description: 'Address balance details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    address: { type: 'string', example: 'SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd' },
                    balance: { type: 'integer', example: 1560000 },
                    balanceFormatted: { type: 'string', example: '0.01560000' },
                    txCount: { type: 'integer', example: 14 },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid address',
            content: { 'application/json': { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
      },
    },
    '/address/{address}/utxo': {
      get: {
        tags: ['Address'],
        summary: 'List unspent transaction outputs (UTXOs)',
        description: 'Returns active unspent transaction outputs for consolidation and sweeps. Bounded up to 500 records.',
        parameters: [
          {
            name: 'address',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd' },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Number of UTXOs to return (1-500, default 50)',
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          },
          {
            name: 'offset',
            in: 'query',
            required: false,
            description: 'Offset for pagination',
            schema: { type: 'integer', minimum: 0, default: 0 },
          },
        ],
        responses: {
          '200': {
            description: 'List of UTXOs',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      txid: { type: 'string', example: 'fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff' },
                      vout: { type: 'integer', example: 1 },
                      amount: { type: 'integer', example: 1560000 },
                      amountFormatted: { type: 'string', example: '0.01560000' },
                      height: { type: 'integer', example: 36890 },
                      confirmations: { type: 'integer', example: 3 },
                      scriptPubKey: { type: 'string', example: '76a914199d24d59b414a597af788a8735c228282dc0f8488ac' },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid address',
            content: { 'application/json': { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
      },
    },
    '/tx/{txid}': {
      get: {
        tags: ['Transaction'],
        summary: 'Lookup transaction status and confirmations',
        description: 'Returns transaction details including block confirmations, inputs, and outputs.',
        parameters: [
          {
            name: 'txid',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff' },
          },
        ],
        responses: {
          '200': {
            description: 'Transaction details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    txid: { type: 'string' },
                    blockHash: { type: 'string', nullable: true },
                    blockHeight: { type: 'integer', nullable: true },
                    confirmations: { type: 'integer' },
                    time: { type: 'integer' },
                    inputs: { type: 'array', items: { type: 'object' } },
                    outputs: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid txid format',
            content: { 'application/json': { $ref: '#/components/schemas/ErrorResponse' } },
          },
          '404': {
            description: 'Transaction not found',
            content: { 'application/json': { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
      },
    },
    '/tx/broadcast': {
      post: {
        tags: ['Transaction'],
        summary: 'Broadcast raw transaction to network',
        description: 'Submits a signed raw transaction hex to the Quavence L1 mempool. Fails-closed on non-hex characters or malformed byte streams.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['rawtx'],
                properties: {
                  rawtx: { type: 'string', description: 'Hex-encoded raw transaction string' },
                  hex: { type: 'string', description: 'Alternative key for raw transaction hex' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Broadcast successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    txid: { type: 'string', example: 'fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff' },
                    status: { type: 'string', example: 'broadcasted' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation or mempool rejection error',
            content: { 'application/json': { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
      },
    },
    '/fee/estimate': {
      get: {
        tags: ['Network'],
        summary: 'Estimate transaction fee rate',
        description: 'Returns recommended fee rate in sat/byte, sat/kb, and QVNC/kb.',
        responses: {
          '200': {
            description: 'Fee rate estimates',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sat_per_byte: { type: 'integer', example: 1 },
                    sat_per_kb: { type: 'integer', example: 1000 },
                    fee_per_kb: { type: 'number', example: 0.00001000 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/status': {
      get: {
        tags: ['Network'],
        summary: 'Get explorer and node sync status',
        description: 'Returns current chain tip block height, best block hash, and sync state.',
        responses: {
          '200': {
            description: 'Network status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    height: { type: 'integer', example: 36891 },
                    bestblockhash: { type: 'string', example: 'a98f1a...' },
                    synced: { type: 'boolean', example: true },
                    ticker: { type: 'string', example: 'QVNC' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Invalid parameter' },
          status: { type: 'string', example: 'rejected' },
        },
      },
    },
  },
};

export function renderDocsHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quavence Explorer — Public API Documentation</title>
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-canvas: #090d14;
      --bg-header: #0d121b;
      --bg-surface: #101622;
      --bg-surface-elevated: #151d2c;
      --border-subtle: #1c2536;
      --border-divider: #232f45;
      --border-highlight: #334360;
      --text-primary: #f8fafc;
      --text-secondary: #cbd5e1;
      --text-muted: #8292a7;
      --text-dim: #526075;
      --text-link: #7ea3c4;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-canvas);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      background-color: var(--bg-header);
      border-bottom: 1px solid var(--border-subtle);
      padding: 0.65rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .brand-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      text-decoration: none;
    }
    .brand-logo {
      width: 22px;
      height: 22px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .brand-name {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #ffffff;
    }
    .desktop-nav {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .desktop-nav .nav-link {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-muted);
      padding: 0.35rem 0.75rem;
      border-radius: 6px;
      border: 1px solid transparent;
      text-decoration: none;
      transition: color 0.12s ease, background-color 0.12s ease;
    }
    .desktop-nav .nav-link:hover {
      color: var(--text-primary);
      background-color: var(--bg-surface-elevated);
    }
    .desktop-nav .nav-link.active {
      color: #ffffff;
      background-color: var(--bg-surface-elevated);
      border-color: var(--border-divider);
    }
    .spec-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.3rem 0.65rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #cbd5e1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 5px;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .spec-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.25);
    }
    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.5rem;
    }
    .panel {
      background-color: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 1.5rem;
    }
    .panel-header {
      padding: 1.25rem;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-header);
    }
    .panel-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.01em;
      margin-bottom: 0.35rem;
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .panel-badge {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      font-weight: 600;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.28);
      padding: 0.12rem 0.45rem;
      border-radius: 3px;
    }
    .panel-description {
      color: var(--text-muted);
      font-size: 0.88rem;
    }
    .invariants-bar {
      padding: 0.85rem 1.25rem;
      background: rgba(15, 23, 42, 0.45);
      border-bottom: 1px solid var(--border-subtle);
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.75rem;
      font-size: 0.8rem;
    }
    .meta-label {
      color: var(--text-dim);
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .meta-value {
      color: var(--text-secondary);
      font-weight: 500;
      margin-top: 0.2rem;
    }
    .section-title {
      font-size: 1rem;
      font-weight: 600;
      margin: 1.5rem 0 0.75rem 0;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .endpoint-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    .endpoint-header {
      padding: 0.75rem 1rem;
      background-color: var(--bg-surface-elevated);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .badge {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.2rem 0.55rem;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .badge-get {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .badge-post {
      background: rgba(34, 197, 94, 0.15);
      color: #34d399;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .endpoint-path {
      font-family: var(--font-mono);
      font-size: 0.88rem;
      font-weight: 600;
      color: #ffffff;
    }
    .endpoint-desc {
      color: var(--text-muted);
      font-size: 0.8rem;
      margin-left: auto;
    }
    .endpoint-body {
      padding: 1rem;
      background: var(--bg-surface);
    }
    .code-preview {
      background: #050811;
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 0.75rem 0.85rem;
      font-family: var(--font-mono);
      font-size: 0.78rem;
      color: #cbd5e1;
      overflow-x: auto;
      margin-top: 0.5rem;
      line-height: 1.45;
    }
    footer {
      border-top: 1px solid var(--border-subtle);
      padding: 1.5rem;
      text-align: center;
      color: var(--text-dim);
      font-size: 0.8rem;
    }
    @media (max-width: 768px) {
      .desktop-nav { display: none; }
      .header { padding: 0.65rem 1rem; }
      main { padding: 1rem; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-brand">
      <a href="/" class="brand-title">
        <img src="/icon-192.png" alt="" class="brand-logo" width="22" height="22">
        <span class="brand-name">QUAVENCE</span>
      </a>
    </div>

    <nav class="desktop-nav">
      <a href="/" class="nav-link">Overview</a>
      <a href="/blocks" class="nav-link">Blocks</a>
      <a href="/attestations" class="nav-link">Attestations</a>
      <a href="/glyphs" class="nav-link">Glyphs</a>
      <a href="/richlist" class="nav-link">Top 100</a>
      <a href="/movements" class="nav-link">Movements</a>
      <a href="/nodes" class="nav-link">Nodes</a>
      <a href="/docs" class="nav-link active">API</a>
    </nav>

    <div class="header-right">
      <a href="/api/openapi.json" target="_blank" rel="noopener noreferrer" class="spec-btn">
        <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        <span>OpenAPI 3.0 Spec</span>
      </a>
    </div>
  </header>

  <main>
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          <span>Quavence Protocol Public API Specification</span>
          <span class="panel-badge">v1.0.0 Mainnet</span>
        </div>
        <p class="panel-description">
          Standardized high-performance REST API suite for network indexing, supply verification, address balances, and transaction broadcast on Quavence L1. Precision amounts are represented in integer satoshis with strict 8-decimal strings.
        </p>
      </div>

      <div class="invariants-bar">
        <div>
          <div class="meta-label">Base Endpoint URL</div>
          <div class="meta-value" style="color: #38bdf8; font-family: var(--font-mono);">https://explorer.quavence.com/api/v1</div>
        </div>
        <div>
          <div class="meta-label">Precision Standard</div>
          <div class="meta-value">Exact integer satoshis (1 QVNC = 100,000,000 sats)</div>
        </div>
        <div>
          <div class="meta-label">Rate Limits</div>
          <div class="meta-value">General: 120 req/min · Heavy: 30 req/min</div>
        </div>
        <div>
          <div class="meta-label">Data Source (SSOT)</div>
          <div class="meta-value" style="color: #34d399; display: flex; align-items: center; gap: 6px;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block;"></span>
            Quavence L1 UTXO Core Engine
          </div>
        </div>
      </div>
    </div>

    <div class="section-title">Supply Verification Suite</div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="endpoint-path">/api/v1/supply/circulating</span>
        <span class="endpoint-desc">Circulating QVNC supply (text/plain & json)</span>
      </div>
      <div class="endpoint-body">
        <div style="font-size: 13px; color: var(--text-muted);">Default: returns plain text number. Query parameter <code>?format=json</code> returns JSON payload.</div>
        <div class="code-preview">curl -s "http://127.0.0.1:3039/api/v1/supply/circulating"
51456.35813140

curl -s "http://127.0.0.1:3039/api/v1/supply/circulating?format=json"
{"circulating": 5145635813140, "circulatingFormatted": "51456.35813140"}</div>
      </div>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="endpoint-path">/api/v1/supply/total</span>
        <span class="endpoint-desc">Total emitted coins up to current height</span>
      </div>
      <div class="endpoint-body">
        <div class="code-preview">curl -s "http://127.0.0.1:3039/api/v1/supply/total"
51456.35813140</div>
      </div>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="endpoint-path">/api/v1/supply/max</span>
        <span class="endpoint-desc">Maximum hard cap supply (250,000 QVNC)</span>
      </div>
      <div class="endpoint-body">
        <div class="code-preview">curl -s "http://127.0.0.1:3039/api/v1/supply/max"
250000.00000000</div>
      </div>
    </div>

    <div class="section-title">Exchange Address & UTXO Suite</div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="endpoint-path">/api/v1/address/:address/validate</span>
        <span class="endpoint-desc">Address checksum and version byte verification</span>
      </div>
      <div class="endpoint-body">
        <div class="code-preview">curl -s "http://127.0.0.1:3039/api/v1/address/SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd/validate"
{"valid": true, "address": "SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd", "is_valid": true, "type": "pubkeyhash"}</div>
      </div>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="endpoint-path">/api/v1/address/:address/balance</span>
        <span class="endpoint-desc">Confirmed balance and transaction counter</span>
      </div>
      <div class="endpoint-body">
        <div class="code-preview">curl -s "http://127.0.0.1:3039/api/v1/address/SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd/balance"
{"address": "SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd", "balance": 1560000, "balanceFormatted": "0.01560000", "txCount": 14}</div>
      </div>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="endpoint-path">/api/v1/address/:address/utxo?limit=50&offset=0</span>
        <span class="endpoint-desc">Unspent transaction outputs for consolidation</span>
      </div>
      <div class="endpoint-body">
        <div class="code-preview">curl -s "http://127.0.0.1:3039/api/v1/address/SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd/utxo?limit=2"
[
  {
    "txid": "fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff",
    "vout": 1,
    "amount": 1560000,
    "amountFormatted": "0.01560000",
    "height": 36890,
    "confirmations": 3,
    "scriptPubKey": "76a914199d24d59b414a597af788a8735c228282dc0f8488ac"
  }
]</div>
      </div>
    </div>

    <div class="section-title">Transaction & Fee Rate Suite</div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="endpoint-path">/api/v1/tx/:txid</span>
        <span class="endpoint-desc">Transaction status, confirmations, inputs and outputs</span>
      </div>
      <div class="endpoint-body">
        <div class="code-preview">curl -s "http://127.0.0.1:3039/api/v1/tx/fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff"</div>
      </div>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-post">POST</span>
        <span class="endpoint-path">/api/v1/tx/broadcast</span>
        <span class="endpoint-desc">Broadcast signed raw transaction hex to L1 mempool</span>
      </div>
      <div class="endpoint-body">
        <div class="code-preview">curl -X POST "http://127.0.0.1:3039/api/v1/tx/broadcast" \\
  -H "Content-Type: application/json" \\
  -d '{"rawtx": "0100000001..."}'

{"txid": "fc0bf71709d29c3ef2a4b3333e749318ab293e7375ae2657c801b85ced3691ff", "status": "broadcasted"}</div>
      </div>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="endpoint-path">/api/v1/fee/estimate</span>
        <span class="endpoint-desc">Recommended relay fee in sat/byte and sat/kb</span>
      </div>
      <div class="endpoint-body">
        <div class="code-preview">curl -s "http://127.0.0.1:3039/api/v1/fee/estimate"
{"sat_per_byte": 1, "sat_per_kb": 1000, "fee_per_kb": 0.00001000}</div>
      </div>
    </div>

    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="badge badge-get">GET</span>
        <span class="endpoint-path">/api/v1/status</span>
        <span class="endpoint-desc">Chain tip block height and daemon synchronization status</span>
      </div>
      <div class="endpoint-body">
        <div class="code-preview">curl -s "http://127.0.0.1:3039/api/v1/status"
{"height": 36891, "bestblockhash": "...", "synced": true, "ticker": "QVNC"}</div>
      </div>
    </div>
  </main>

  <footer>
    Quavence Protocol &copy; 2026. Zero-Trust Decentralized Infrastructure.
  </footer>
</body>
</html>`;
}

router.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(openApiSpec);
});

router.get('/docs', (_req: Request, res: Response) => {
  res.type('text/html; charset=utf-8').send(renderDocsHtml());
});

export default router;
