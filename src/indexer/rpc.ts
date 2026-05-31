import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load env from the project root (quavence_explorer/.env)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const host = process.env.QUAVENCE_RPC_HOST || '127.0.0.1';
const port = process.env.QUAVENCE_RPC_PORT || '27715';
const user = process.env.QUAVENCE_RPC_USER || '';
const password = process.env.QUAVENCE_RPC_PASSWORD || '';
const timeout = parseInt(process.env.QUAVENCE_RPC_TIMEOUT_MS || '15000', 10);

const url = `http://${host}:${port}`;

const rpcClient = axios.create({
  baseURL: url,
  timeout,
  headers: {
    'Content-Type': 'application/json',
  },
  auth: user && password ? { username: user, password } : undefined,
});

export async function callRpc(method: string, params: any[] = []): Promise<any> {
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };
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
    throw error;
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
      // Fetch transactions sequentially to avoid RPC flooding
      const txids = block.tx as string[];
      block.tx = [];
      for (const txid of txids) {
        const tx = await getRawTransaction(txid);
        block.tx.push(tx);
      }
    }
  }
  return block;
}

export async function getPeerInfo(): Promise<any[]> {
  try {
    return await callRpc('getpeerinfo');
  } catch (error) {
    return [];
  }
}

export async function getStakingInfo(): Promise<any> {
  try {
    return await callRpc('getstakinginfo');
  } catch (error) {
    return null;
  }
}
