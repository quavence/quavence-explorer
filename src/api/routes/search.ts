import { Router } from 'express';
import { db } from '../../db/db.js';
import { isValidQuavenceAddress } from '../utils/base58.js';
import { getRawTransaction, getBlock } from '../../indexer/rpc.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    let q = (req.query.q as string || '').trim();

    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    // Strip surrounding quotes (single, double, curly quotes, backticks)
    q = q.replace(/^['"`«»“”‘’]+|['"`«»“”‘’]+$/g, '').trim();

    // Support full URLs or path fragments
    const txUrlMatch = q.match(/(?:^|\/)(?:tx|transaction)\/([0-9a-fA-F]{64})/i);
    if (txUrlMatch) q = txUrlMatch[1];

    const blockUrlMatch = q.match(/(?:^|\/)block\/([0-9a-fA-F]{64}|\d+)/i);
    if (blockUrlMatch) q = blockUrlMatch[1];

    const addrUrlMatch = q.match(/(?:^|\/)address\/([Ss][1-9A-HJ-NP-Za-km-z]{25,40})/i);
    if (addrUrlMatch) q = addrUrlMatch[1];

    const glyphUrlMatch = q.match(/(?:^|\/)glyphs?\/([a-zA-Z0-9_-]+)/i);
    if (glyphUrlMatch) {
      return res.json({ type: 'glyph', value: glyphUrlMatch[1], exists: true });
    }

    // Check glyph prefix patterns: glyph:12, glyph 12, #12
    const glyphPrefixMatch = q.match(/^(?:glyph[:\s#]+|#)(\d+)$/i);
    if (glyphPrefixMatch) {
      return res.json({ type: 'glyph', value: glyphPrefixMatch[1], exists: true });
    }

    // Strip labels like tx:, txid:, block:, address:, addr:
    q = q.replace(/^(?:tx|txid|transaction|block|address|addr):\s*/i, '').trim();
    q = q.replace(/^#+/, '').trim();

    // Strip 0x prefix if 64 hex characters follow
    if (/^0x([0-9a-fA-F]{64})$/i.test(q)) {
      q = q.slice(2);
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

      // Check live node RPC (mempool or newly arrived block)
      try {
        const liveTx = await getRawTransaction(q);
        if (liveTx) {
          return res.json({ type: 'tx', value: q, exists: true });
        }
      } catch {}

      try {
        const liveBlock = await getBlock(q);
        if (liveBlock) {
          return res.json({ type: 'block', value: q, exists: true });
        }
      } catch {}
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
