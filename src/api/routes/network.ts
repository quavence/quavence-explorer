import { Router, Request, Response } from 'express';
import { getVerifiedPeersForApi } from '../peers.js';
import { isPrivateOrLocalIP } from '../utils/net-filter.js';

const router = Router();

interface AnchorNode {
  host: string;
  port: number;
  addnode: string;
  label: string;
}

function parseAnchorNodes(envValue: string | undefined): AnchorNode[] {
  if (!envValue) return [];

  const results: AnchorNode[] = [];
  const entries = envValue.split(',');

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.lastIndexOf(':');
    if (colonIdx === -1) continue;

    const host = trimmed.substring(0, colonIdx).trim();
    const portStr = trimmed.substring(colonIdx + 1).trim();

    if (!host || !portStr) continue;

    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) continue;

    if (isPrivateOrLocalIP(host)) continue;

    results.push({
      host,
      port,
      addnode: `addnode=${host}:${port}`,
      label: 'Official Anchor',
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
