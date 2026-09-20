import { Router } from 'express';
import { db } from '../../db/db.js';

const router = Router();

// In-memory cache for external DAO metadata and SVG content
const glyphMetadataCache = new Map<string, any>();

async function fetchGlyphArtifact(glyphHashOrEdition: string | number): Promise<any> {
  const key = String(glyphHashOrEdition).trim();
  if (!key) return null;

  if (glyphMetadataCache.has(key)) {
    return glyphMetadataCache.get(key);
  }

  const candidateUrls = [
    process.env.DAO_API_URL,
    'http://10.77.0.2:3002',
    'http://127.0.0.1:3002',
    'https://quavence.com',
  ].filter(Boolean) as string[];

  for (const baseUrl of candidateUrls) {
    try {
      const res = await fetch(`${baseUrl}/api/glyphs/details/${encodeURIComponent(key)}`);
      if (res.ok) {
        const json: any = await res.json();
        if (json.ok && json.data) {
          const artifact = {
            id: json.data.id,
            name: json.data.name,
            theme: json.data.attributes?.theme || json.data.theme || null,
            archetype: json.data.attributes?.archetype || json.data.archetype || null,
            rarity: json.data.attributes?.rarity || json.data.rarity || 'Common',
            holderType: json.data.attributes?.holder_type || json.data.holder_type || null,
            originDao: json.data.attributes?.origin_dao || json.data.attributes?.provenance?.origin_dao || null,
            originDrop: json.data.attributes?.origin_drop || json.data.attributes?.provenance?.origin_drop || null,
            mintedAt: json.data.attributes?.minted_at || json.data.attributes?.provenance?.minted_at || null,
            provenance: json.data.attributes?.provenance || null,
            svgContent: json.data.contentUri || null,
            imageRef: json.data.imageRef || null,
            vrfProof: json.data.vrfProof || json.data.vrf_proof || null,
          };
          glyphMetadataCache.set(key, artifact);
          return artifact;
        }
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

// Generate fallback parametric SVG if external DAO API is unreachable
function generateFallbackSvg(edition: number, name: string): string {
  const hue = (edition * 137.5) % 360;
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
    <rect width="512" height="512" rx="24" fill="#030712"/>
    <circle cx="256" cy="256" r="180" fill="none" stroke="hsl(${hue}, 80%, 55%)" stroke-width="2" stroke-dasharray="8 6" opacity="0.4"/>
    <circle cx="256" cy="256" r="120" fill="none" stroke="hsl(${hue}, 90%, 65%)" stroke-width="3" opacity="0.7"/>
    <polygon points="256,160 330,288 182,288" fill="none" stroke="hsl(${hue}, 85%, 60%)" stroke-width="3"/>
    <circle cx="256" cy="256" r="14" fill="hsl(${hue}, 95%, 70%)"/>
    <text x="256" y="440" font-family="monospace" font-size="16" fill="#94a3b8" text-anchor="middle" letter-spacing="3">POUS GLYPH #${edition}</text>
  </svg>`;
}

// GET /api/glyphs
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string || '24', 10), 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string || '0', 10), 0);
    const search = (req.query.search as string || '').trim().toLowerCase();
    const rarityFilter = (req.query.rarity as string || '').trim().toLowerCase();
    const sort = (req.query.sort as string || 'edition_asc').toLowerCase();

    // Query all glyph entries in DB
    const glyphRows = await db.all(`
      SELECT g.txid, g.block_hash, g.block_height, g.block_time,
             g.glyph_hash, g.edition, g.op_type, g.op_label,
             g.carrier_address, g.carrier_vout, g.created_at,
             u.address as current_holder_address,
             u.amount as carrier_amount
      FROM glyphs g
      LEFT JOIN utxos u ON g.txid = u.txid AND g.carrier_vout = u.vout_index
      ORDER BY g.edition ASC, g.block_height DESC, g.rowid DESC
    `) as any[];

    // Group by edition to get latest on-chain carrier state for each unique edition
    const editionMap = new Map<number, any>();
    for (const row of glyphRows) {
      if (!editionMap.has(row.edition)) {
        // First encountered row is the latest in canonical lineage
        const isBurned = row.op_label === 'BURN';
        editionMap.set(row.edition, {
          ...row,
          active_holder: isBurned ? null : (row.current_holder_address || row.carrier_address),
          is_burned: isBurned,
          history_count: 1,
        });
      } else {
        const existing = editionMap.get(row.edition);
        existing.history_count++;
      }
    }

    const uniqueEditions = Array.from(editionMap.values());

    // Enrich with metadata
    const enrichedList = await Promise.all(
      uniqueEditions.map(async (item) => {
        const artifact = (await fetchGlyphArtifact(item.glyph_hash)) ||
                         (await fetchGlyphArtifact(item.edition)) || null;

        const rawName = artifact?.name || `PoUS Glyph #${item.edition}`;
        const cleanName = rawName.replace(new RegExp(`\\s*#${item.edition}\\b`, 'i'), '').trim();
        const theme = artifact?.theme || (item.edition <= 100 ? 'Genesis Matrix' : 'Autonomous AI Worker');
        const archetype = artifact?.archetype || 'PoUS L1 Consensus';
        const rarity = artifact?.rarity || (item.edition <= 10 ? 'Legendary' : item.edition <= 100 ? 'Rare' : 'Common');
        const svgContent = artifact?.svgContent || generateFallbackSvg(item.edition, cleanName);

        return {
          edition: item.edition,
          glyphHash: item.glyph_hash,
          txid: item.txid,
          blockHeight: item.block_height,
          blockTime: item.block_time,
          opLabel: item.op_label,
          carrierAddress: item.active_holder || item.carrier_address,
          carrierAmount: item.carrier_amount || 10000,
          historyCount: item.history_count,
          name: cleanName,
          fullName: rawName,
          theme,
          archetype,
          rarity,
          svgContent,
          imageRef: artifact?.imageRef || null,
        };
      })
    );

    // Filter by search and rarity
    let filtered = enrichedList;

    if (search) {
      const isNum = /^\d+$/.test(search.replace(/^#/, ''));
      if (isNum) {
        const edNum = parseInt(search.replace(/^#/, ''), 10);
        filtered = filtered.filter((g) => g.edition === edNum);
      } else {
        filtered = filtered.filter((g) =>
          g.name.toLowerCase().includes(search) ||
          g.theme.toLowerCase().includes(search) ||
          (g.carrierAddress && g.carrierAddress.toLowerCase().includes(search)) ||
          g.glyphHash.toLowerCase().includes(search)
        );
      }
    }

    if (rarityFilter && rarityFilter !== 'all') {
      filtered = filtered.filter((g) => g.rarity.toLowerCase() === rarityFilter);
    }

    // Sort
    if (sort === 'edition_desc') {
      filtered.sort((a, b) => b.edition - a.edition);
    } else if (sort === 'newest') {
      filtered.sort((a, b) => b.blockHeight - a.blockHeight);
    } else {
      filtered.sort((a, b) => a.edition - b.edition);
    }

    const total = filtered.length;
    const paginatedItems = filtered.slice(offset, offset + limit);

    // Compute network-wide glyph stats
    const uniqueHoldersSet = new Set(
      enrichedList.map((g) => g.carrierAddress).filter(Boolean)
    );

    res.json({
      items: paginatedItems,
      pagination: {
        total,
        limit,
        offset,
      },
      stats: {
        totalMinted: enrichedList.length,
        uniqueHolders: uniqueHoldersSet.size,
        consensusRatio: '100% PoUS',
        carrierBaseSat: 10000,
      },
      filters: {
        search,
        rarity: rarityFilter || 'all',
        sort,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/glyphs/:idOrEdition
router.get('/:idOrEdition', async (req, res) => {
  try {
    const param = req.params.idOrEdition.trim();
    let glyphRows: any[] = [];

    if (/^\d+$/.test(param)) {
      const edition = parseInt(param, 10);
      glyphRows = await db.all(`
        SELECT g.*, b.time as block_timestamp
        FROM glyphs g
        LEFT JOIN blocks b ON g.block_height = b.height
        WHERE g.edition = ?
        ORDER BY g.block_height DESC, g.rowid DESC
      `, edition);
    } else {
      glyphRows = await db.all(`
        SELECT g.*, b.time as block_timestamp
        FROM glyphs g
        LEFT JOIN blocks b ON g.block_height = b.height
        WHERE g.glyph_hash = ? OR g.txid = ?
        ORDER BY g.block_height DESC, g.rowid DESC
      `, param, param);
    }

    if (!glyphRows.length) {
      return res.status(404).json({ error: 'PoUS Glyph not found in on-chain index' });
    }

    const latest = glyphRows[0];
    const isBurned = latest.op_label === 'BURN';
    const artifact = (await fetchGlyphArtifact(latest.glyph_hash)) ||
                     (await fetchGlyphArtifact(latest.edition)) || null;

    const rawName = artifact?.name || `PoUS Glyph #${latest.edition}`;
    const cleanName = rawName.replace(new RegExp(`\\s*#${latest.edition}\\b`, 'i'), '').trim();

    // Check active UTXO
    const utxo = isBurned ? null : await db.get(`
      SELECT address, amount FROM utxos WHERE txid = ? AND vout_index = ?
    `, latest.txid, latest.carrier_vout) as any;

    const prov = artifact?.provenance || {};
    const originDao = prov.origin_dao || artifact?.originDao || (latest.edition <= 100 ? 'quavence' : 'quavence');
    const isOgNode = artifact?.holderType === 'og_node_operator' || prov.holder_type === 'og_node_operator';
    const originDrop = prov.origin_drop || artifact?.originDrop || (isOgNode ? 'OG_NODE_GENESIS_001' : (latest.edition <= 100 ? 'Genesis Series' : 'Quavence PoUS Collection'));
    const mintedAt = prov.minted_at || artifact?.mintedAt || (latest.block_time ? new Date(latest.block_time * 1000).toISOString() : new Date().toISOString());

    res.json({
      edition: latest.edition,
      glyphHash: latest.glyph_hash,
      mintTxid: glyphRows[glyphRows.length - 1].txid,
      latestTxid: latest.txid,
      blockHeight: latest.block_height,
      blockTime: latest.block_time,
      currentHolder: isBurned ? null : (utxo?.address || latest.carrier_address),
      carrierAmount: isBurned ? 0 : (utxo?.amount || 10000),
      carrierVout: latest.carrier_vout,
      name: cleanName,
      fullName: rawName,
      theme: artifact?.theme || (latest.edition <= 100 ? 'Genesis Matrix' : 'Autonomous AI Worker'),
      archetype: artifact?.archetype || 'PoUS L1 Consensus',
      rarity: artifact?.rarity || (latest.edition <= 10 ? 'Legendary' : 'Common'),
      holderType: artifact?.holderType || prov.holder_type || (isOgNode ? 'og_node_operator' : null),
      provenance: {
        originDao,
        originDrop,
        mintedAt,
        holderType: artifact?.holderType || prov.holder_type || null,
        isPlatformExclusive: originDao === 'quavence',
        isOgGenesis: isOgNode || originDrop === 'OG_NODE_GENESIS_001',
      },
      svgContent: artifact?.svgContent || generateFallbackSvg(latest.edition, cleanName),
      history: glyphRows.map((r) => ({
        txid: r.txid,
        blockHeight: r.block_height,
        blockTime: r.block_time,
        opLabel: r.op_label,
        carrierAddress: r.carrier_address,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
