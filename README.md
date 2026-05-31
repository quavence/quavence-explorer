# Quavence Blockchain Explorer

A public, read-only blockchain explorer for the Quavence network. It indexes blocks, transactions, and address balances from a local Quavence node via JSON-RPC and serves the data through a REST API and a React web interface.

## How It Works

- **JSON-RPC**: The explorer connects to a local `quavenced` node using its JSON-RPC interface. No wallet, staking, or mutation commands are ever invoked.
- **Indexer**: A background sync loop reads blocks from the node starting at height `0`, parses transactions, tracks UTXOs and address balances, and stores everything in a local SQLite database.
- **SQLite**: A single `data/explorer.sqlite` file stores the indexed chain data. The database and schema are created automatically on first run.
- **API**: An Express server exposes REST endpoints for blocks, transactions, addresses, the rich list, QVNC movements, network status, and peer information.
- **Frontend**: A React web UI served by the same Express server. The dashboard shows network supply, emission schedule, latest blocks, and a network nodes sidebar.

## Technology Stack

- **Backend / API**: Node.js + Express
- **Frontend**: React + Vite (Vanilla CSS)
- **Database**: SQLite (`sqlite3` + `sqlite` async wrapper)
- **Language**: TypeScript
- **JSON-RPC source**: `quavenced` / `quavence-cli`

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your node credentials:

```bash
cp .env.example .env
```

Required settings:

```env
QUAVENCE_RPC_HOST=127.0.0.1
QUAVENCE_RPC_PORT=27715
QUAVENCE_RPC_USER=your_rpc_username
QUAVENCE_RPC_PASSWORD=your_rpc_password
```

### 3. Development Mode

Start both the API server and Vite frontend dev server:

```bash
npm run dev
```

- API: `http://127.0.0.1:3039`
- Web: `http://127.0.0.1:5173` (proxies `/api` to `3039`)

### 4. Run the Indexer

In a separate terminal:

```bash
npm run indexer
```

The indexer creates `data/explorer.sqlite` (if it does not exist), syncs all blocks from height `0`, and then polls for new blocks on an interval controlled by `INDEXER_POLL_INTERVAL_MS`.

### 5. Production Build

```bash
npm run build
```

This compiles both the backend (`tsc`) and frontend (`vite build`). Static assets are output to `dist/web`.

### 6. Production Start

```bash
npm start
```

Runs `node dist/api/server.js`, serving both the API and the static frontend on `PORT` (default `3039`).

## Reindex / Reset Database

Delete the SQLite file to start fresh:

```bash
Remove-Item data/explorer.sqlite
```

The database and schema are automatically re-created on the next run of the indexer or API server.

If a blockchain reorg is detected during indexing, the indexer rolls back to the fork height and rebuilds UTXO state automatically.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `QUAVENCE_RPC_HOST` | `127.0.0.1` | Quavence node RPC host |
| `QUAVENCE_RPC_PORT` | `27715` | Quavence node RPC port |
| `QUAVENCE_RPC_USER` | — | RPC username |
| `QUAVENCE_RPC_PASSWORD` | — | RPC password |
| `QUAVENCE_RPC_TIMEOUT_MS` | `15000` | RPC request timeout |
| `INDEXER_POLL_INTERVAL_MS` | `10000` | Indexer poll interval when fully synced |
| `PUBLIC_ANCHOR_NODES` | — | Comma-separated `host:port` anchor nodes shown in the UI |
| `NETWORK_PEERS_SYNC_INTERVAL_MS` | `300000` | Peer list sync interval |
| `PEER_SEEN_THRESHOLD` | `10` | Minimum `seenCount` to consider promotion |
| `PEER_PASS_THRESHOLD` | `8` | Minimum `passCount` to consider promotion |
| `PEER_FAIL_MAX` | `2` | Maximum `failCount` allowed for promotion |
| `PEER_FIRST_SEEN_HOURS` | `6` | Minimum hours since first seen to promote |
| `PEER_TCP_CONCURRENCY` | `5` | Max concurrent TCP checks per sync cycle |
| `PEER_TCP_TIMEOUT_MS` | `5000` | Timeout per TCP check |
| `PEER_MAX_TCP_CHECKS_PER_SYNC` | `30` | Max TCP checks per sync cycle |
