import { Router, Request, Response } from 'express';
import { db } from '../../../db/db.js';
import { QUAVENCE } from '../../../config.js';

const router = Router();

function wantsJsonResponse(req: Request): boolean {
  if (req.query.format === 'json') {
    return true;
  }
  if (req.query.format === 'text' || req.query.format === 'plain') {
    return false;
  }
  const accept = req.headers.accept;
  if (accept && accept.includes('application/json') && !accept.includes('text/plain') && !accept.includes('*/*')) {
    return true;
  }
  return false;
}

/**
 * GET /api/v1/supply/circulating
 * Default response: text/plain "51456.35813140"
 * ?format=json: {"circulating": 5145635813140, "circulatingFormatted": "51456.35813140"}
 */
router.get('/circulating', async (req: Request, res: Response) => {
  const isJson = wantsJsonResponse(req);
  try {
    const heightRow = await db.get('SELECT MAX(height) as height FROM blocks') as { height: number | null } | undefined;
    const currentHeight = heightRow?.height ?? 0;

    const utxoRow = await db.get('SELECT SUM(amount) as total FROM utxos') as { total: number | null } | undefined;

    // Strict on-chain UTXO SSOT: if blocks exist but utxos table is empty or unindexed, fail loudly (Fail-Closed)
    if (currentHeight > 0 && (!utxoRow || utxoRow.total === null || utxoRow.total <= 0)) {
      if (isJson) {
        return res.status(503).json({
          error: 'UTXO set unindexed or desynchronized',
          status: 'UTXO_UNAVAILABLE',
        });
      }
      return res.status(503).type('text/plain; charset=utf-8').send('Service Unavailable: UTXO set desynchronized');
    }

    const circulatingSat = Number(utxoRow?.total || 0);
    const circulatingFormatted = (circulatingSat / QUAVENCE.coin).toFixed(8);

    if (isJson) {
      return res.json({
        circulating: circulatingSat,
        circulatingFormatted,
      });
    }

    res.type('text/plain; charset=utf-8').send(circulatingFormatted);
  } catch (error: any) {
    console.error('[API Error in /api/v1/supply/circulating]:', error);
    if (isJson) {
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.status(500).type('text/plain; charset=utf-8').send('Internal server error');
  }
});

/**
 * GET /api/v1/supply/total
 * Total emitted coins in text/plain or json
 */
router.get('/total', async (req: Request, res: Response) => {
  const isJson = wantsJsonResponse(req);
  try {
    const heightRow = await db.get('SELECT MAX(height) as height FROM blocks') as { height: number | null } | undefined;
    const currentHeight = heightRow?.height ?? 0;

    const utxoRow = await db.get('SELECT SUM(amount) as total FROM utxos') as { total: number | null } | undefined;

    if (currentHeight > 0 && (!utxoRow || utxoRow.total === null || utxoRow.total <= 0)) {
      if (isJson) {
        return res.status(503).json({
          error: 'UTXO set unindexed or desynchronized',
          status: 'UTXO_UNAVAILABLE',
        });
      }
      return res.status(503).type('text/plain; charset=utf-8').send('Service Unavailable: UTXO set desynchronized');
    }

    const totalSat = Number(utxoRow?.total || 0);
    const totalFormatted = (totalSat / QUAVENCE.coin).toFixed(8);

    if (isJson) {
      return res.json({
        total: totalSat,
        totalFormatted,
      });
    }

    res.type('text/plain; charset=utf-8').send(totalFormatted);
  } catch (error: any) {
    console.error('[API Error in /api/v1/supply/total]:', error);
    if (isJson) {
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.status(500).type('text/plain; charset=utf-8').send('Internal server error');
  }
});

/**
 * GET /api/v1/supply/max
 * Hard max supply limit (250000.00000000)
 */
router.get('/max', async (req: Request, res: Response) => {
  const isJson = wantsJsonResponse(req);
  try {
    const maxSat = QUAVENCE.maxSupply * QUAVENCE.coin;
    const maxFormatted = QUAVENCE.maxSupply.toFixed(8);

    if (isJson) {
      return res.json({
        max: maxSat,
        maxFormatted,
      });
    }

    res.type('text/plain; charset=utf-8').send(maxFormatted);
  } catch (error: any) {
    console.error('[API Error in /api/v1/supply/max]:', error);
    if (isJson) {
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.status(500).type('text/plain; charset=utf-8').send('Internal server error');
  }
});

export default router;
