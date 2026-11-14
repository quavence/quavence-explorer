import { Router, Request, Response } from 'express';
import { db } from '../../../db/db.js';
import { isValidQuavenceAddress, decodeBase58 } from '../../utils/base58.js';
import { QUAVENCE } from '../../../config.js';

const router = Router();

function deriveP2pkhScript(address: string): string {
  try {
    const decoded = decodeBase58(address);
    if (decoded && decoded.length >= 25) {
      // 1 byte version, 20 bytes pubkey hash, 4 bytes checksum
      const pubKeyHash = decoded.subarray(1, 21).toString('hex');
      return `76a914${pubKeyHash}88ac`;
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * GET /api/v1/address/:address/validate
 * Validates address format and returns canonical address metadata
 */
router.get('/:address/validate', (req: Request, res: Response) => {
  const address = req.params.address;
  const valid = isValidQuavenceAddress(address);

  if (!valid) {
    return res.json({
      valid: false,
      address,
      is_valid: false,
      type: 'invalid',
    });
  }

  res.json({
    valid: true,
    address,
    is_valid: true,
    type: 'pubkeyhash',
  });
});

/**
 * GET /api/v1/address/:address/balance
 * Fast balance lookup without heavy transaction history
 */
router.get('/:address/balance', async (req: Request, res: Response) => {
  try {
    const address = req.params.address;

    if (!isValidQuavenceAddress(address)) {
      return res.status(400).json({ error: 'Invalid Quavence address' });
    }

    const info = await db.get(
      'SELECT balance, tx_count FROM addresses WHERE address = ?',
      address
    ) as { balance: number; tx_count: number } | undefined;

    const balance = info?.balance ?? 0;
    const txCount = info?.tx_count ?? 0;
    const balanceFormatted = (balance / QUAVENCE.coin).toFixed(8);

    res.json({
      address,
      balance,
      balanceFormatted,
      txCount,
    });
  } catch (error: any) {
    console.error('[API Error in /api/v1/address/:address/balance]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/address/:address/utxo
 * Fast UTXO query for exchange deposit sweep & consolidation
 * Bounded with limit clamping Math.min(Math.max(limit, 1), 500)
 */
router.get('/:address/utxo', async (req: Request, res: Response) => {
  try {
    const address = req.params.address;

    if (!isValidQuavenceAddress(address)) {
      return res.status(400).json({ error: 'Invalid Quavence address' });
    }

    const parsedLimit = parseInt(req.query.limit as string || '50', 10);
    const limit = Math.min(Math.max(isNaN(parsedLimit) ? 50 : parsedLimit, 1), 500);

    const parsedOffset = parseInt(req.query.offset as string || '0', 10);
    const offset = Math.max(isNaN(parsedOffset) ? 0 : parsedOffset, 0);

    const heightRow = await db.get('SELECT MAX(height) as height FROM blocks') as { height: number | null } | undefined;
    const currentHeight = heightRow?.height ?? 0;

    const scriptPubKey = deriveP2pkhScript(address);

    const utxos = await db.all(`
      SELECT txid, vout_index as vout, amount, block_height as height
      FROM utxos
      WHERE address = ?
      ORDER BY block_height DESC
      LIMIT ? OFFSET ?
    `, address, limit, offset) as Array<{
      txid: string;
      vout: number;
      amount: number;
      height: number;
    }>;

    const formattedUtxos = utxos.map((u) => {
      const confirmations = u.height > 0 ? Math.max(0, currentHeight - u.height + 1) : 0;
      return {
        txid: u.txid,
        vout: u.vout,
        amount: u.amount,
        amountFormatted: (u.amount / QUAVENCE.coin).toFixed(8),
        height: u.height,
        confirmations,
        scriptPubKey,
      };
    });

    res.json(formattedUtxos);
  } catch (error: any) {
    console.error('[API Error in /api/v1/address/:address/utxo]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
