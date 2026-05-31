import { Router } from 'express';
import { db } from '../../db/db.js';
import { isValidQuavenceAddress } from '../utils/base58.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const q = (req.query.q as string || '').trim();

    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    // 1. Check if height
    if (/^\d+$/.test(q)) {
      const height = parseInt(q, 10);
      const block = await db.get('SELECT height FROM blocks WHERE height = ?', height);
      if (block) {
        return res.json({ type: 'block', value: height.toString(), exists: true });
      }
    }

    // 2. Check if transaction ID or block hash (64 char hex)
    if (/^[0-9a-fA-F]{64}$/.test(q)) {
      const block = await db.get('SELECT hash FROM blocks WHERE hash = ?', q);
      if (block) {
        return res.json({ type: 'block', value: q, exists: true });
      }

      const tx = await db.get('SELECT txid FROM transactions WHERE txid = ?', q);
      if (tx) {
        return res.json({ type: 'tx', value: q, exists: true });
      }
    }

    // 3. Check if valid Quavence public address
    if (isValidQuavenceAddress(q)) {
      const addr = await db.get('SELECT address FROM addresses WHERE address = ?', q);
      if (addr) {
        return res.json({
          type: 'address',
          value: q,
          exists: true,
          url: `/address/${q}`
        });
      } else {
        return res.json({
          type: 'address',
          value: q,
          exists: false,
          url: `/address/${q}`,
          message: 'Address has no indexed transactions yet'
        });
      }
    }

    res.json({ type: 'not_found' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
