import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';
import dotenv from 'dotenv';

import { callRpc } from '../indexer/rpc.js';
import { isPrivateOrLocalIP, normalizeHost } from './utils/net-filter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DATA_DIR = path.resolve(__dirname, '../../data');
const PEERS_FILE = path.join(DATA_DIR, 'network-peers.json');

const P2P_PORT = 27714;
const MIN_PROTOCOL_VERSION = 70001;
const QUAVENCE_CLIENT_MARKER = 'quavence';

const SYNC_INTERVAL_MS = parseInt(process.env.NETWORK_PEERS_SYNC_INTERVAL_MS || '300000', 10);

const SEEN_THRESHOLD = parseInt(process.env.PEER_SEEN_THRESHOLD || '10', 10);
const PASS_THRESHOLD = parseInt(process.env.PEER_PASS_THRESHOLD || '8', 10);
const FAIL_MAX = parseInt(process.env.PEER_FAIL_MAX || '2', 10);
const FIRST_SEEN_HOURS = parseFloat(process.env.PEER_FIRST_SEEN_HOURS || '6');
const LAST_SEEN_MAX_MINUTES = parseFloat(process.env.PEER_LAST_SEEN_MAX_MINUTES || '30');
const TCP_PASS_THRESHOLD = parseInt(process.env.PEER_TCP_PASS_THRESHOLD || '3', 10);

const DEMOTE_FAIL_COUNT = parseInt(process.env.PEER_DEMOTE_FAIL_COUNT || '5', 10);
const DEMOTE_LAST_SEEN_HOURS = parseFloat(process.env.PEER_DEMOTE_LAST_SEEN_HOURS || '24');
const DEMOTE_TCP_FAIL_STREAK = parseInt(process.env.PEER_DEMOTE_TCP_FAIL_STREAK || '3', 10);
const DEMOTE_HEIGHT_LAG = parseInt(process.env.PEER_DEMOTE_HEIGHT_LAG || '20', 10);

const MAX_VERIFIED_PER_SUBNET = 2;
const TCP_CONCURRENCY = parseInt(process.env.PEER_TCP_CONCURRENCY || '5', 10);
const TCP_TIMEOUT_MS = parseInt(process.env.PEER_TCP_TIMEOUT_MS || '5000', 10);
const MAX_TCP_CHECKS_PER_SYNC = parseInt(process.env.PEER_MAX_TCP_CHECKS_PER_SYNC || '30', 10);

export type TrustLevel = 'official_anchor' | 'verified_peer' | 'observed_peer';

export interface PeerRecord {
  host: string;
  port: number;
  source: string;
  trustLevel: TrustLevel;
  firstSeenAt: number;
  lastSeenAt: number;
  lastCheckedAt: number;
  seenCount: number;
  passCount: number;
  failCount: number;
  tcpPassCount: number;
  tcpFailStreak: number;
  lastStatus: string;
  lastError: string | null;
  protocolVersion: number | null;
  subver: string | null;
  lastKnownHeight: number | null;
  lastKnownBestHash: string | null;
  verifiedSince: number | null;
}

interface PeersStore {
  peers: Record<string, PeerRecord>;
}

let store: PeersStore = { peers: {} };
let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncInProgress = false;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStore(): void {
  ensureDataDir();
  try {
    if (fs.existsSync(PEERS_FILE)) {
      const raw = fs.readFileSync(PEERS_FILE, 'utf-8');
      store = JSON.parse(raw) as PeersStore;
      if (!store.peers) store.peers = {};
    }
  } catch {
    store = { peers: {} };
  }
}

function saveStore(): void {
  ensureDataDir();
  const tmp = PEERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmp, PEERS_FILE);
}

function isOnionAddress(addr: string): boolean {
  return addr.endsWith('.onion');
}

function getIPv4Subnet24(host: string): string {
  const normalized = normalizeHost(host);
  const parts = normalized.split('.');
  if (parts.length !== 4) return normalized;
  return parts.slice(0, 3).join('.');
}

function parsePeerAddress(addr: string): { host: string; port: number } | null {
  if (!addr) return null;

  let host: string;
  let port: number;

  if (addr.startsWith('[')) {
    const bracketEnd = addr.indexOf(']');
    if (bracketEnd === -1) return null;
    host = addr.substring(1, bracketEnd);
    const portPart = addr.substring(bracketEnd + 1);
    if (!portPart.startsWith(':')) return null;
    port = parseInt(portPart.substring(1), 10);
  } else {
    const lastColon = addr.lastIndexOf(':');
    if (lastColon === -1) return null;
    host = addr.substring(0, lastColon);
    port = parseInt(addr.substring(lastColon + 1), 10);
  }

  if (!host || isNaN(port) || port < 1 || port > 65535) return null;

  return { host, port };
}

function getOfficialAnchorKeys(): Set<string> {
  const envValue = process.env.PUBLIC_ANCHOR_NODES || '';
  const keys = new Set<string>();
  for (const entry of envValue.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const addrPart = trimmed.includes('=') ? trimmed.split('=')[0].trim() : trimmed;
    const colonIdx = addrPart.lastIndexOf(':');
    if (colonIdx === -1) continue;
    const host = addrPart.substring(0, colonIdx).trim();
    const portStr = addrPart.substring(colonIdx + 1).trim();
    const port = parseInt(portStr, 10);
    if (!host || isNaN(port)) continue;
    keys.add(`${host}:${port}`);
  }
  return keys;
}

function basicFilter(peer: any, officialKeys: Set<string>): { ok: boolean; reason: string } {
  const addr = peer.addr as string | undefined;
  if (!addr) return { ok: false, reason: 'no addr' };

  if (isOnionAddress(addr)) return { ok: false, reason: 'onion not supported' };

  const parsed = parsePeerAddress(addr);
  if (!parsed) return { ok: false, reason: 'unparseable addr' };

  if (isPrivateOrLocalIP(parsed.host)) return { ok: false, reason: 'private/local IP' };

  if (parsed.port !== P2P_PORT) return { ok: false, reason: `port ${parsed.port} != ${P2P_PORT}` };

  const key = `${parsed.host}:${parsed.port}`;
  if (officialKeys.has(key)) return { ok: false, reason: 'is official anchor' };

  const proto = peer.version ?? peer.protocol ?? 0;
  if (proto < MIN_PROTOCOL_VERSION) return { ok: false, reason: `protocol ${proto} < ${MIN_PROTOCOL_VERSION}` };

  const subver = (peer.subver as string) || '';
  if (!subver || !subver.toLowerCase().includes(QUAVENCE_CLIENT_MARKER)) {
    return { ok: false, reason: `subver missing or mismatch: ${subver}` };
  }

  return { ok: true, reason: '' };
}

function tcpCheck(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function tcpCheckBatched(
  candidates: Array<{ host: string; port: number; key: string }>,
  concurrency: number,
  timeoutMs: number,
  maxChecks: number,
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  const limited = candidates.slice(0, maxChecks);

  for (let i = 0; i < limited.length; i += concurrency) {
    const batch = limited.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (c) => {
        const ok = await tcpCheck(c.host, c.port, timeoutMs);
        return { key: c.key, ok };
      }),
    );
    for (const r of batchResults) {
      results.set(r.key, r.ok);
    }
  }

  for (const c of limited) {
    if (!results.has(c.key)) {
      results.set(c.key, false);
    }
  }

  return results;
}

function countVerifiedInSubnet(targetStore: PeersStore, subnet: string): number {
  let count = 0;
  for (const key of Object.keys(targetStore.peers)) {
    const p = targetStore.peers[key];
    if (p.trustLevel === 'verified_peer' && getIPv4Subnet24(p.host) === subnet) {
      count++;
    }
  }
  return count;
}

function shouldPromote(p: PeerRecord, anchorHeight: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const firstSeenAgeHours = (now - p.firstSeenAt) / 3600;
  const lastSeenAgeMinutes = (now - p.lastSeenAt) / 60;

  if (p.seenCount < SEEN_THRESHOLD) return false;
  if (p.passCount < PASS_THRESHOLD) return false;
  if (p.failCount > FAIL_MAX) return false;
  if (firstSeenAgeHours < FIRST_SEEN_HOURS) return false;
  if (lastSeenAgeMinutes > LAST_SEEN_MAX_MINUTES) return false;
  if (p.tcpPassCount < TCP_PASS_THRESHOLD) return false;

  if (p.lastKnownHeight !== null && anchorHeight > 0) {
    if (p.lastKnownHeight < anchorHeight - DEMOTE_HEIGHT_LAG) return false;
  }

  const subnet = getIPv4Subnet24(p.host);
  if (countVerifiedInSubnet(store, subnet) >= MAX_VERIFIED_PER_SUBNET) return false;

  return true;
}

function shouldDemote(p: PeerRecord, anchorHeight: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const lastSeenAgeHours = (now - p.lastSeenAt) / 3600;

  if (p.tcpFailStreak >= DEMOTE_TCP_FAIL_STREAK) return true;
  if (lastSeenAgeHours > DEMOTE_LAST_SEEN_HOURS) return true;
  if (p.failCount >= DEMOTE_FAIL_COUNT) return true;

  if (p.lastKnownHeight !== null && anchorHeight > 0) {
    if (p.lastKnownHeight < anchorHeight - DEMOTE_HEIGHT_LAG) return true;
  }

  const subver = (p.subver || '').toLowerCase();
  if (p.subver !== null && !subver.includes(QUAVENCE_CLIENT_MARKER)) return true;

  return false;
}

export async function syncNetworkPeers(): Promise<void> {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    loadStore();

    let rpcPeers: any[] = [];
    try {
      rpcPeers = await callRpc('getpeerinfo');
      if (!Array.isArray(rpcPeers)) rpcPeers = [];
    } catch {
      return;
    }

    const officialKeys = getOfficialAnchorKeys();
    const now = Math.floor(Date.now() / 1000);
    const seenThisRound = new Set<string>();

    let anchorHeight = 0;
    try {
      const info = await callRpc('getblockchaininfo');
      anchorHeight = info?.blocks ?? 0;
    } catch {}

    const filteredKeys: string[] = [];

    for (const rpcPeer of rpcPeers) {
      const addr = rpcPeer.addr as string | undefined;
      if (!addr) continue;

      const parsed = parsePeerAddress(addr);
      if (!parsed) continue;

      const key = `${parsed.host}:${parsed.port}`;
      seenThisRound.add(key);

      const filterResult = basicFilter(rpcPeer, officialKeys);
      if (!filterResult.ok) continue;

      let record = store.peers[key];
      if (!record) {
        record = {
          host: parsed.host,
          port: parsed.port,
          source: 'getpeerinfo',
          trustLevel: 'observed_peer',
          firstSeenAt: now,
          lastSeenAt: now,
          lastCheckedAt: now,
          seenCount: 0,
          passCount: 0,
          failCount: 0,
          tcpPassCount: 0,
          tcpFailStreak: 0,
          lastStatus: 'pending',
          lastError: null,
          protocolVersion: rpcPeer.version ?? null,
          subver: rpcPeer.subver ?? null,
          lastKnownHeight: rpcPeer.startingheight ?? rpcPeer.synced_headers ?? rpcPeer.synced_blocks ?? null,
          lastKnownBestHash: null,
          verifiedSince: null,
        };
        store.peers[key] = record;
      }

      record.seenCount++;
      record.lastSeenAt = now;
      record.lastCheckedAt = now;
      record.protocolVersion = rpcPeer.version ?? record.protocolVersion;
      record.subver = rpcPeer.subver ?? record.subver;
      record.lastKnownHeight = rpcPeer.startingheight ?? rpcPeer.synced_headers ?? rpcPeer.synced_blocks ?? record.lastKnownHeight;

      filteredKeys.push(key);
    }

    const tcpCandidates = filteredKeys.map((key) => {
      const r = store.peers[key];
      return { host: r.host, port: r.port, key };
    });

    const tcpResults = await tcpCheckBatched(tcpCandidates, TCP_CONCURRENCY, TCP_TIMEOUT_MS, MAX_TCP_CHECKS_PER_SYNC);

    for (const key of filteredKeys) {
      const record = store.peers[key];

      const tcpOk = tcpResults.get(key);
      if (tcpOk === undefined) {
        record.lastStatus = 'pending';
        record.lastError = null;
      } else if (tcpOk) {
        record.tcpPassCount++;
        record.tcpFailStreak = 0;
        record.passCount++;
        record.lastStatus = 'passed';
        record.lastError = null;
      } else {
        record.tcpFailStreak++;
        record.failCount++;
        record.lastStatus = 'failed';
        record.lastError = 'tcp unreachable';
      }

      if (record.trustLevel === 'verified_peer') {
        if (shouldDemote(record, anchorHeight)) {
          record.trustLevel = 'observed_peer';
          record.verifiedSince = null;
        }
      } else {
        if (shouldPromote(record, anchorHeight)) {
          record.trustLevel = 'verified_peer';
          record.verifiedSince = now;
        }
      }
    }

    for (const key of Object.keys(store.peers)) {
      if (!seenThisRound.has(key)) {
        const record = store.peers[key];
        if (record.trustLevel === 'verified_peer') {
          const lastSeenAgeHours = (now - record.lastSeenAt) / 3600;
          if (lastSeenAgeHours > DEMOTE_LAST_SEEN_HOURS) {
            record.trustLevel = 'observed_peer';
            record.verifiedSince = null;
          }
        }
      }
    }

    saveStore();
  } finally {
    syncInProgress = false;
  }
}

export function getVerifiedPeersForApi(): Array<{
  host: string;
  port: number;
  addnode: string;
  label: string;
  networkType: 'onion' | 'ipv4' | 'ipv6';
  lastSeenAt: number;
  verifiedSince: number | null;
}> {
  loadStore();
  const result = [];
  for (const key of Object.keys(store.peers)) {
    const p = store.peers[key];
    if (p.trustLevel === 'verified_peer') {
      const isOnion = p.host.toLowerCase().endsWith('.onion');
      result.push({
        host: p.host,
        port: p.port,
        addnode: `addnode=${p.host}:${p.port}`,
        label: 'Verified Peer',
        networkType: isOnion ? ('onion' as const) : (p.host.includes(':') ? ('ipv6' as const) : ('ipv4' as const)),
        lastSeenAt: p.lastSeenAt,
        verifiedSince: p.verifiedSince,
      });
    }
  }
  return result;
}

export function startPeerSync(): void {
  loadStore();
  syncNetworkPeers().catch(() => {});
  syncTimer = setInterval(() => {
    syncNetworkPeers().catch(() => {});
  }, SYNC_INTERVAL_MS);
}

export function stopPeerSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

export function getPeersStore(): PeersStore {
  loadStore();
  return store;
}
