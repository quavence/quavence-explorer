import { Router } from 'express';
import { db } from '../../db/db.js';
import { QUAVENCE } from '../../config.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const requested = Number.parseInt(String(req.query.limit ?? '100'), 10);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 100;

    // Get circulating supply for share calculation (from real UTXO set)
    const heightRow = await db.get('SELECT MAX(height) as height FROM blocks') as { height: number | null };
    const currentHeight = heightRow?.height ?? 0;

    const utxoRow = await db.get('SELECT SUM(amount) as total FROM utxos') as { total: number | null };
    if (currentHeight > 0 && (!utxoRow || utxoRow.total === null || utxoRow.total <= 0)) {
      return res.status(503).json({
        error: 'UTXO set unindexed or desynchronized',
        status: 'UTXO_UNAVAILABLE',
        items: [],
        total: 0,
      });
    }

    const circulatingSupply = Number(utxoRow?.total || 0);

    // Get top addresses by balance from the authoritative UTXO set
    const addresses = await db.all(`
      SELECT address, SUM(amount) as balance
      FROM utxos
      WHERE address IS NOT NULL AND amount > 0
      GROUP BY address
      ORDER BY balance DESC
      LIMIT ?
    `, limit) as { address: string; balance: number }[];

    const items = addresses.map((row, index) => {
      const balanceFormatted = (row.balance / QUAVENCE.coin).toFixed(8);
      const parts = balanceFormatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      const formatted = parts.join('.') + ' ' + QUAVENCE.ticker;

      const supplyShare = circulatingSupply > 0 ? (row.balance / circulatingSupply) * 100 : 0;

      return {
        rank: index + 1,
        address: row.address,
        balance: row.balance,
        balanceFormatted: formatted,
        supplyShare: parseFloat(supplyShare.toFixed(2))
      };
    });

    res.json({
      items,
      total: items.length
    });
  } catch (error: any) {
    console.error('[API Error in /api/richlist]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;