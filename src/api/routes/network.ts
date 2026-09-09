import { Router, Request, Response } from 'express';
import { getVerifiedPeersForApi } from '../peers.js';
import { isPrivateOrLocalIP } from '../utils/net-filter.js';

const router = Router();

interface AnchorNode {
  host: string;
  port: number;
  addnode: string;
  label: string;
  networkType: 'onion' | 'ipv4' | 'ipv6';
}

function parseAnchorNodes(envValue: string | undefined): AnchorNode[] {
  if (!envValue) return [];

  const results: AnchorNode[] = [];
  const entries = envValue.split(',');

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    let addrPart = trimmed;
    let explicitLabel = '';
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      addrPart = trimmed.substring(0, eqIdx).trim();
      explicitLabel = trimmed.substring(eqIdx + 1).trim();
    }

    const colonIdx = addrPart.lastIndexOf(':');
    if (colonIdx === -1) continue;

    const host = addrPart.substring(0, colonIdx).trim();
    const portStr = addrPart.substring(colonIdx + 1).trim();

    if (!host || !portStr) continue;

    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) continue;

    const isOnion = host.toLowerCase().endsWith('.onion');
    if (!isOnion && isPrivateOrLocalIP(host)) continue;

    let networkType: 'onion' | 'ipv4' | 'ipv6' = 'ipv4';
    if (isOnion) {
      networkType = 'onion';
    } else if (host.includes(':')) {
      networkType = 'ipv6';
    }

    let defaultLabel = 'Official Anchor';
    if (host === '89.125.130.116') {
      defaultLabel = 'Official VPS Anchor (Clearnet IPv4)';
    } else if (host === 'vh3na7dqjmqzdbvoghosbdmdmpltkhmvcvsukmtv24eo23diqqlknoqd.onion') {
      defaultLabel = 'Official VPS Anchor (Tor v3)';
    } else if (host === 'kalwfcd7ia3gcwksq7yipu3b2lseibic6ytmawkbvq7odlleic6lifqd.onion') {
      defaultLabel = 'Official Core Seednode (Tor v3)';
    } else if (isOnion) {
      defaultLabel = 'Official Tor v3 Anchor';
    }

    results.push({
      host,
      port,
      addnode: `addnode=${host}:${port}`,
      label: explicitLabel || defaultLabel,
      networkType,
    });
  }

  return results;
}

router.get('/nodes', (req: Request, res: Response) => {
  try {
    const officialAnchors = parseAnchorNodes(process.env.PUBLIC_ANCHOR_NODES);
    const verifiedPeers = getVerifiedPeersForApi();
    res.json({
      officialAnchors,
      verifiedPeers,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
