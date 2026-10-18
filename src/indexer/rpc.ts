import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load env from the project root (quavence_explorer/.env)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const RPC_TX_CHUNK_SIZE = 8;
export const RPC_MAX_RETRIES = 2;
export const RPC_RETRY_DELAY_MS = 150;

export const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 16,
  maxFreeSockets: 8,
  timeout: 30000,
});

export function createRpcClient(baseUrl?: string, customTimeout?: number): AxiosInstance {
  const host = process.env.QUAVENCE_RPC_HOST || '127.0.0.1';
  const port = process.env.QUAVENCE_RPC_PORT || '27715';
  const user = process.env.QUAVENCE_RPC_USER || '';
  const password = process.env.QUAVENCE_RPC_PASSWORD || '';
  const timeout = customTimeout ?? parseInt(process.env.QUAVENCE_RPC_TIMEOUT_MS || '15000', 10);
  const targetUrl = baseUrl || `http://${host}:${port}`;

  return axios.create({
    baseURL: targetUrl,
    timeout,
    headers: {
      'Content-Type': 'application/json',
    },
    auth: user && password ? { username: user, password } : undefined,
    httpAgent,
  });
}

let rpcClient = createRpcClient();

export function setRpcClient(client: AxiosInstance): void {
  rpcClient = client;
}

export function resetRpcClient(baseUrl?: string, customTimeout?: number): void {
  rpcClient = createRpcClient(baseUrl, customTimeout);
}

export function isTransientSocketError(error: any): boolean {
  if (error?.response) {
    return false; // Server replied with HTTP status/body, not an abrupt socket reset
  }
  const code = error?.code || error?.cause?.code;
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED' ||
    code === 'EPIPE' ||
    code === 'ESOCKETTIMEDOUT'
  );
}

export async function callRpc(method: string, params: any[] = []): Promise<any> {
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const response = await rpcClient.post('', payload);
      if (response.data.error) {
        throw new Error(`RPC Error: ${response.data.error.message || JSON.stringify(response.data.error)}`);
      }
      return response.data.result;
    } catch (error: any) {
      if (error.response && error.response.data && error.response.data.error) {
        throw new Error(`RPC Error: ${error.response.data.error.message}`);
      }
      if (attempt <= RPC_MAX_RETRIES && isTransientSocketError(error)) {
        await new Promise((resolve) => setTimeout(resolve, RPC_RETRY_DELAY_MS * attempt));
        continue;
      }
      throw error;
    }
  }
}

export async function getBlockchainInfo(): Promise<any> {
  return callRpc('getblockchaininfo');
}

export async function getBlockHash(height: number): Promise<string> {
  return callRpc('getblockhash', [height]);
}

export async function getRawTransaction(txid: string): Promise<any> {
  return callRpc('getrawtransaction', [txid, 1]);
}

// Robust block fetcher compliant with Quavence RPC specifications
export async function getBlock(hash: string): Promise<any> {
  // Quavence expects verbose parameter as a boolean
  const block = await callRpc('getblock', [hash, true]);

  if (block && Array.isArray(block.tx) && block.tx.length > 0) {
    if (typeof block.tx[0] === 'string') {
      const txids = block.tx as string[];
      const fullTxs: any[] = [];
      for (let i = 0; i < txids.length; i += RPC_TX_CHUNK_SIZE) {
        const chunk = txids.slice(i, i + RPC_TX_CHUNK_SIZE);
        const txs = await Promise.all(chunk.map((txid) => getRawTransaction(txid)));
        fullTxs.push(...txs);
      }
      block.tx = fullTxs;
    }
  }
  return block;
}

export async function getPeerInfo(): Promise<any[]> {
  const peers = await callRpc('getpeerinfo');
  return Array.isArray(peers) ? peers : [];
}

export async function getStakingInfo(): Promise<any> {
  return callRpc('getstakinginfo');
}

