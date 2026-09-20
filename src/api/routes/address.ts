import { Router } from 'express';
import { db } from '../../db/db.js';
import { isValidQuavenceAddress } from '../utils/base58.js';

const router = Router();

const glyphArtifactCache = new Map<string, any>();

async function fetchGlyphArtifact(glyphHashOrTxid: string): Promise<any> {
  if (!glyphHashOrTxid) return null;
  if (glyphArtifactCache.has(glyphHashOrTxid)) {
    return glyphArtifactCache.get(glyphHashOrTxid);
  }

  const candidateUrls = [
    process.env.DAO_API_URL,
    'http://10.77.0.2:3002',
    'http://127.0.0.1:3002',
    'https://quavence.com',
  ].filter(Boolean) as string[];

  for (const baseUrl of candidateUrls) {
    try {
      const resGlyph = await fetch(`${baseUrl}/api/glyphs/details/${glyphHashOrTxid}`);
      if (resGlyph.ok) {
        const resData: any = await resGlyph.json();
        if (resData.ok && resData.data) {
          const artifact = {
            name: resData.data.name,
            theme: resData.data.attributes?.theme,
            rarity: resData.data.attributes?.rarity,
            svgContent: resData.data.contentUri,
            imageRef: resData.data.imageRef,
          };
          glyphArtifactCache.set(glyphHashOrTxid, artifact);
          return artifact;
        }
      }
    } catch {
      // try next
    }
  }
  return null;
}

router.get('/:address', async (req, res) => {
  try {
    const address = req.params.address;

    // Validate address format
    if (!isValidQuavenceAddress(address)) {
      return res.status(400).json({ error: 'Invalid Quavence address' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string || '50', 10), 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string || '0', 10), 0);

    // Get address summary
    const info = await db.get('SELECT * FROM addresses WHERE address = ?', address) as any;

    if (!info) {
      // Address has no activity yet
      return res.json({
        address,
        balance: 0,
        received: 0,
        sent: 0,
        txCount: 0,
        tx_count: 0,
        glyphs: [],
        transactions: [],
        utxos: [],
        indexed: false,
        pagination: { limit, offset, total: 0 }
      });
    }

    // Get UTXOs (bounded to prevent memory exhaustion on large staker/pool addresses)
    const utxos = await db.all(`
      SELECT txid, vout_index, amount, block_height
      FROM utxos
      WHERE address = ?
      ORDER BY block_height DESC
      LIMIT 200
    `, address) as any[];

    // Get address transactions with their parent transaction types and canonical glyph info
    const rawTxs = await db.all(`
      SELECT at.txid, at.block_height, at.amount, at.type, t.type as tx_type,
             g.edition as glyph_edition, g.op_label as glyph_op_label, g.glyph_hash as glyph_hash,
             g.carrier_address, g.carrier_vout
      FROM address_transactions at
      JOIN transactions t ON at.txid = t.txid
      LEFT JOIN glyphs g ON at.txid = g.txid
      WHERE at.address = ?
      ORDER BY at.block_height DESC
      LIMIT ? OFFSET ?
    `, address, limit, offset) as any[];

    // Find currently held PoUS AI Glyphs for this address (unspent carrier UTXO belonging to active lineage)
    const heldGlyphs = await db.all(`
      SELECT g.*, u.amount as carrier_amount, u.block_height as utxo_block_height
      FROM glyphs g
      JOIN utxos u ON g.txid = u.txid AND g.carrier_vout = u.vout_index
      WHERE u.address = ?
        AND g.op_label != 'BURN'
        AND g.rowid = (
          SELECT g2.rowid FROM glyphs g2
          WHERE g2.edition = g.edition
          ORDER BY g2.block_height DESC, g2.rowid DESC
          LIMIT 1
        )
      ORDER BY g.block_height DESC
    `, address) as any[];

    // Enrich held glyphs with metadata
    const enrichedGlyphs = await Promise.all(
      heldGlyphs.map(async (g) => {
        const artifact = await fetchGlyphArtifact(g.glyph_hash || g.txid);

        return {
          txid: g.txid,
          glyphHash: g.glyph_hash,
          edition: g.edition,
          opType: g.op_type,
          opLabel: g.op_label,
          carrierAddress: g.carrier_address,
          carrierVout: g.carrier_vout,
          carrierDust: g.carrier_amount,
          blockHeight: g.utxo_block_height,
          blockTime: g.block_time,
          isHeld: true,
          status: 'held',
          name: artifact?.name || `PoUS Genesis Solar #${g.edition}`,
          theme: artifact?.theme || null,
          rarity: artifact?.rarity || null,
          svgContent: artifact?.svgContent || null,
          imageRef: artifact?.imageRef || null,
        };
      })
    );

    // Map transactions list with glyph artwork & precise action detection
    const txs = await Promise.all(
      rawTxs.map(async (row) => {
        let glyphData: any = null;
        if (row.glyph_edition) {
          // Precise detection: only mark as glyph if this output or input was part of the glyph movement
          // If 'sent': this input sent the carrier output/tx
          // If 'received': only if amount === 10000 (carrier dust). If other amount, it's just QVNC change
          const isGlyphMovement = row.type === 'sent' || row.amount === 10000;
          if (isGlyphMovement) {
            const artifact = await fetchGlyphArtifact(row.glyph_hash || row.txid);
            glyphData = {
              edition: row.glyph_edition,
              opLabel: row.glyph_op_label,
              glyphHash: row.glyph_hash,
              name: artifact?.name,
              rarity: artifact?.rarity,
              imageRef: artifact?.imageRef,
              svgContent: artifact?.svgContent,
            };
          }
        }

        return {
          txid: row.txid,
          block_height: row.block_height,
          amount: row.amount,
          type: row.type,
          tx_type: glyphData ? `pous_glyph_${row.glyph_op_label.toLowerCase()}` : row.tx_type,
          glyph: glyphData,
        };
      })
    );

    // Get total count
    const totalRow = await db.get('SELECT COUNT(*) as count FROM address_transactions WHERE address = ?', address) as { count: number };

    const utxoSumRow = await db.get('SELECT SUM(amount) as total FROM utxos WHERE address = ?', address) as { total: number | null };
    const spendableBalance = utxoSumRow?.total ?? info.balance ?? 0;

    // Carrier UTXO tagging: accurately mark outputs that carry PoUS AI Glyphs
    const carrierMap = new Map<string, any>();
    for (const g of heldGlyphs) {
      carrierMap.set(`${g.txid}:${g.carrier_vout}`, g);
    }

    const enrichedUtxos = utxos.map((u) => {
      const key = `${u.txid}:${u.vout_index}`;
      const carrierGlyph = carrierMap.get(key);
      if (carrierGlyph) {
        return {
          ...u,
          isCarrier: true,
          glyphEdition: carrierGlyph.edition,
          glyphHash: carrierGlyph.glyph_hash,
          glyphOpLabel: carrierGlyph.op_label,
        };
      }
      return {
        ...u,
        isCarrier: false,
      };
    });

    res.json({
      address: info.address,
      balance: spendableBalance,
      received: info.received,
      sent: info.sent,
      txCount: info.tx_count,
      glyphs: enrichedGlyphs,
      transactions: txs,
      utxos: enrichedUtxos,
      indexed: true,
      pagination: {
        limit,
        offset,
        total: totalRow.count,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
