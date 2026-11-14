import { Router, Request, Response } from 'express';

const router = Router();

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Quavence Explorer Public API for Exchanges & Aggregators',
    version: '1.0.0',
    description:
      'Standardized high-performance public REST API suite for Centralized Exchanges (CEX) and Analytics Aggregators (CoinMarketCap, CoinGecko) on Quavence L1.',
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
    { name: 'Supply', description: 'Aggregator circulating, total and maximum supply endpoints' },
    { name: 'Address', description: 'Exchange deposit address validation, balance and UTXO queries' },
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
  <title>Quavence Protocol Public API Documentation</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070B14;
      --card-bg: #0B1222;
      --card-border: #1E293B;
      --text-main: #F1F5F9;
      --text-muted: #94A3B8;
      --accent-blue: #38BDF8;
      --accent-green: #34D399;
      --accent-amber: #FBBF24;
      --tag-get: #0284C7;
      --tag-post: #059669;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.6;
      padding: 0;
      margin: 0;
    }
    header {
      border-bottom: 1px solid var(--card-border);
      padding: 24px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(11, 18, 34, 0.85);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #0284C7 0%, #38BDF8 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
      color: #fff;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand-version {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      background: rgba(56, 189, 248, 0.1);
      color: var(--accent-blue);
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    .header-links a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid var(--card-border);
      transition: all 0.2s ease;
    }
    .header-links a:hover {
      color: var(--text-main);
      border-color: var(--accent-blue);
    }
    main {
      max-width: 1140px;
      margin: 0 auto;
      padding: 40px 24px 80px 24px;
    }
    .intro {
      margin-bottom: 40px;
    }
    .intro h1 {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.03em;
      margin-bottom: 12px;
    }
    .intro p {
      color: var(--text-muted);
      font-size: 15px;
      max-width: 800px;
    }
    .section-title {
      font-size: 20px;
      font-weight: 600;
      margin: 40px 0 16px 0;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .endpoint-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      margin-bottom: 16px;
      overflow: hidden;
      transition: border-color 0.2s;
    }
    .endpoint-card:hover {
      border-color: #334155;
    }
    .endpoint-header {
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      border-bottom: 1px solid rgba(30, 41, 59, 0.5);
    }
    .badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-get {
      background: rgba(2, 132, 199, 0.15);
      color: #38BDF8;
      border: 1px solid rgba(2, 132, 199, 0.3);
    }
    .badge-post {
      background: rgba(5, 150, 105, 0.15);
      color: #34D399;
      border: 1px solid rgba(5, 150, 105, 0.3);
    }
    .endpoint-path {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 500;
      color: #E2E8F0;
    }
    .endpoint-desc {
      color: var(--text-muted);
      font-size: 13px;
      margin-left: auto;
    }
    .endpoint-body {
      padding: 18px 20px;
      background: rgba(7, 11, 20, 0.4);
    }
    .code-preview {
      background: #040711;
      border: 1px solid #1E293B;
      border-radius: 8px;
      padding: 14px 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #CBD5E1;
      overflow-x: auto;
      margin-top: 10px;
    }
    footer {
      border-top: 1px solid var(--card-border);
      padding: 24px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-logo">Q</div>
      <div class="brand-title">Quavence Protocol Public API</div>
      <div class="brand-version">v1.0.0 Mainnet</div>
    </div>
    <div class="header-links">
      <a href="/api/openapi.json" target="_blank">OpenAPI 3.0.3 Spec (JSON)</a>
    </div>
  </header>

  <main>
    <div class="intro">
      <h1>Exchange & Aggregator Public API Suite</h1>
      <p>
        High-performance, standardized endpoints designed for Centralized Exchanges (CEX: Gate.io, MEXC, Bitget, TradeOgre, NonKYC)
        and Market Aggregators (CoinMarketCap, CoinGecko). Precision amounts are represented in integer satoshis with strict 8-decimal strings.
      </p>
    </div>

    <div class="section-title">Aggregator Supply Suite (CoinMarketCap & CoinGecko)</div>

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

    <div class="section-title">Exchange Transaction & Fee Suite</div>

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
