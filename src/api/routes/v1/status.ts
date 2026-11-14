import { Router, Request, Response } from 'express';
import { db } from '../../../db/db.js';
import { getBlockchainInfo } from '../../../indexer/rpc.js';
import { QUAVENCE } from '../../../config.js';

const router = Router();

/**
 * GET /api/v1/status
 * Synchronized chain tip height and best block hash for exchange indexing daemons
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const maxBlockRow = await db.get(
      'SELECT height, hash FROM blocks ORDER BY height DESC LIMIT 1'
    ) as { height: number; hash: string } | undefined;

    const dbHeight = maxBlockRow?.height ?? 0;
    const dbHash = maxBlockRow?.hash ?? '';

    let nodeInfo: any = null;
    try {
      nodeInfo = await getBlockchainInfo();
    } catch {
      // RPC node may be starting or offline
    }

    const nodeHeight = typeof nodeInfo?.blocks === 'number' ? nodeInfo.blocks : dbHeight;
    const bestblockhash = nodeInfo?.bestblockhash || dbHash;
    const synced = nodeInfo ? Math.abs(dbHeight - nodeHeight) <= 1 : true;
    const height = Math.max(dbHeight, nodeHeight);

    res.json({
      height,
      bestblockhash,
      synced,
      ticker: QUAVENCE.ticker,
    });
  } catch (error: any) {
    console.error('[API Error in /api/v1/status]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
