import { Router } from 'express';
import { db } from '../../db/db.js';
import { QUAVENCE } from '../../config.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const requested = Number.parseInt(String(req.query.limit ?? '100'), 10);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 100;

    // Get circulating supply for share calculation
    const premineSat = QUAVENCE.premine * QUAVENCE.coin;
    const posSubsidyRow = await db.get("SELECT SUM(subsidy) as total FROM blocks WHERE block_type = 'pos' AND height > 0 AND subsidy IS NOT NULL") as { total: number | null };
    const posSubsidyEmitted = posSubsidyRow && posSubsidyRow.total ? posSubsidyRow.total : 0;
    const circulatingSupply = premineSat + posSubsidyEmitted;

    // Get top addresses by balance (excluding zero balances)
    const addresses = await db.all(`
      SELECT address, balance
      FROM addresses
      WHERE balance > 0
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
    res.status(500).json({ error: error.message });
  }
});

export default router;