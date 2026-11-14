import { Router, Request, Response } from 'express';
import { callRpc } from '../../../indexer/rpc.js';
import { QUAVENCE } from '../../../config.js';

const router = Router();

/**
 * GET /api/v1/fee/estimate
 * Recommended network transaction fee in sat/byte and sat/kb
 */
router.get('/estimate', async (_req: Request, res: Response) => {
  // Quavence standard baseline fee: 1 sat/byte = 1000 sat/kb = 0.00001000 QVNC/kb
  let satPerKb = 1000;

  try {
    const rpcEstimate = await callRpc('estimatefee', [2]);
    if (typeof rpcEstimate === 'number' && rpcEstimate > 0) {
      satPerKb = Math.max(1000, Math.round(rpcEstimate * QUAVENCE.coin));
    }
  } catch {
    // If estimatefee is unsupported or mempool has insufficient samples, retain standard minimum relay fee
  }

  const satPerByte = Math.max(1, Math.round(satPerKb / 1000));
  const feePerKb = satPerKb / QUAVENCE.coin;

  res.json({
    sat_per_byte: satPerByte,
    sat_per_kb: satPerKb,
    fee_per_kb: feePerKb,
  });
});

export default router;
