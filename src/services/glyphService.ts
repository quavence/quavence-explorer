import { db as defaultDb } from '../db/db.js';
import { BoundedCache } from '../api/utils/cache.js';
import { getDaoCandidateUrls } from '../api/utils/dao-url.js';

export interface GlyphCatalogOptions {
  limit?: number;
  offset?: number;
  search?: string;
  rarity?: string;
  sort?: string;
}

export interface GlyphCatalogItem {
  edition: number;
  glyphHash: string;
  txid: string;
  blockHeight: number;
  blockTime: number;
  opLabel: string;
  carrierAddress: string | null;
  carrierVout: number;
  carrierAmount: number;
  historyCount: number;
  name: string;
  fullName: string;
  theme: string;
  archetype: string;
  rarity: string;
  status: 'ACTIVE' | 'BURNED';
  isBurned: boolean;
  svgContent: string;
  imageRef: string | null;
  is_living_agent: boolean;
  cycle_count: number;
  state_root_hash: string | null;
  agent_status: 'ACTIVE' | 'BURNED';
}

export interface GlyphCatalogResponse {
  items: GlyphCatalogItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
  stats: {
    totalMinted: number;
    uniqueHolders: number;
    consensusRatio: string;
    carrierBaseSat: number;
  };
  filters: {
    search: string;
    rarity: string;
    sort: string;
  };
}

export interface GlyphHistoryItem {
  txid: string;
  blockHeight: number;
  blockTime: number;
  opLabel: string;
  carrierAddress: string;
  stateRootHash: string | null;
  cycleCount: number;
}

export interface GlyphDetailResponse {
  edition: number;
  glyphHash: string;
  mintTxid: string;
  latestTxid: string;
  blockHeight: number;
  blockTime: number;
  currentHolder: string | null;
  carrierAmount: number;
  carrierVout: number;
  name: string;
  fullName: string;
  theme: string;
  archetype: string;
  rarity: string;
  status: 'ACTIVE' | 'BURNED';
  isBurned: boolean;
  holderType: string | null;
  is_living_agent: boolean;
  cycle_count: number;
  cycleCount: number;
  state_root_hash: string | null;
  stateRootHash: string | null;
  agent_status: 'ACTIVE' | 'BURNED';
  provenance: {
    originDao: string;
    originDrop: string;
    mintedAt: string;
    holderType: string | null;
    isPlatformExclusive: boolean;
    isOgGenesis: boolean;
  };
  svgContent: string;
  history: GlyphHistoryItem[];
}

// Bounded in-memory cache for external DAO metadata and SVG content (prevents OOM DoS)
export const glyphMetadataCache = new BoundedCache<string, any>(1000, 600_000);

export async function fetchGlyphArtifact(glyphHashOrEdition: string | number): Promise<any> {
  const key = String(glyphHashOrEdition).trim();
  if (!key) return null;

  if (glyphMetadataCache.has(key)) {
    return glyphMetadataCache.get(key);
  }

  const candidateUrls = getDaoCandidateUrls();

  for (const baseUrl of candidateUrls) {
    try {
      const res = await fetch(`${baseUrl}/api/glyphs/details/${encodeURIComponent(key)}`, {
        signal: AbortSignal.timeout(3000),
      });
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
          if (json.data.edition != null) {
            glyphMetadataCache.set(String(json.data.edition), artifact);
          }
          if (json.data.attributes?.glyph_hash) {
            glyphMetadataCache.set(String(json.data.attributes.glyph_hash), artifact);
          }
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
export function generateFallbackSvg(edition: number, name: string): string {
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

export async function getGlyphsCatalog(
  options: GlyphCatalogOptions = {},
  customDb?: any
): Promise<GlyphCatalogResponse> {
  const activeDb = customDb || defaultDb;
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const search = (options.search || '').trim().toLowerCase();
  const rarityFilter = (options.rarity || '').trim().toLowerCase();
  const sort = (options.sort || 'edition_asc').toLowerCase();

  // Query all glyph entries in DB
  const glyphRows = await activeDb.all(`
    SELECT g.txid, g.op_vout, g.block_hash, g.block_height, g.block_time,
           g.glyph_hash, g.edition, g.op_type, g.op_label,
           g.carrier_address, g.carrier_vout, g.created_at,
           g.rarity, g.name, g.theme, g.archetype,
           g.state_root_hash, g.cycle_count,
           u.address as current_holder_address,
           u.amount as carrier_amount
    FROM glyphs g
    LEFT JOIN utxos u ON g.txid = u.txid AND g.carrier_vout = u.vout_index
    ORDER BY g.glyph_hash ASC, g.edition ASC, g.block_height DESC, g.rowid DESC
  `) as any[];

  // Group by (glyph_hash, edition) composite key to support multi-collection namespace isolation
  const glyphMap = new Map<string, any>();
  for (const row of glyphRows) {
    const key = `${row.glyph_hash}:${row.edition}`;
    if (!glyphMap.has(key)) {
      // First encountered row is the latest in canonical lineage
      const isBurned = row.op_label === 'BURN';
      const isLivingAgent = Boolean(
        Number(row.cycle_count || 0) > 0 ||
        row.state_root_hash ||
        row.op_label === 'STATE_SYNC'
      );
      glyphMap.set(key, {
        ...row,
        active_holder: isBurned ? null : (row.current_holder_address || row.carrier_address),
        is_burned: isBurned,
        is_living_agent: isLivingAgent,
        cycle_count: Number(row.cycle_count || 0),
        state_root_hash: row.state_root_hash || null,
        agent_status: isBurned ? 'BURNED' : 'ACTIVE',
        history_count: 1,
      });
    } else {
      const existing = glyphMap.get(key);
      existing.history_count++;
      if (!existing.rarity && row.rarity) {
        existing.rarity = row.rarity;
        existing.name = row.name;
      }
      if (!existing.theme && row.theme) {
        existing.theme = row.theme;
      }
      if (!existing.archetype && row.archetype) {
        existing.archetype = row.archetype;
      }
      if (!existing.state_root_hash && row.state_root_hash) {
        existing.state_root_hash = row.state_root_hash;
      }
      if (Number(row.cycle_count || 0) > existing.cycle_count) {
        existing.cycle_count = Number(row.cycle_count || 0);
      }
      if (row.op_label === 'STATE_SYNC' || row.state_root_hash || Number(row.cycle_count || 0) > 0) {
        existing.is_living_agent = true;
      }
    }
  }

  const uniqueEditions = Array.from(glyphMap.values());

  // Compute network-wide glyph stats from the lightweight db rows
  const uniqueHoldersSet = new Set(
    uniqueEditions.map((item) => item.active_holder).filter(Boolean)
  );
  const totalMinted = uniqueEditions.length;

  // Fast in-memory metadata normalization (external DAO fetch happens strictly on paged slice)
  for (const item of uniqueEditions) {
    const artifact = glyphMetadataCache.get(item.glyph_hash) || glyphMetadataCache.get(String(item.edition));
    if (artifact) {
      const rawName = artifact.name || item.name || `PoUS Glyph #${item.edition}`;
      item.name = rawName.replace(new RegExp(`\\s*#${item.edition}\\b`, 'i'), '').trim();
      item.fullName = rawName;
      item.theme = artifact.theme || item.theme || null;
      item.archetype = artifact.archetype || item.archetype || null;
      item.rarity = artifact.rarity || item.rarity || 'Common';
    } else {
      item.rarity = item.rarity || 'Common';
      item.name = item.name || `PoUS Glyph #${item.edition}`;
      item.fullName = item.fullName || `PoUS Glyph #${item.edition}`;
    }
  }

  // Filter by search and rarity
  let filtered = uniqueEditions;

  if (search) {
    const isNum = /^\d+$/.test(search.replace(/^#/, ''));
    if (isNum) {
      const edNum = parseInt(search.replace(/^#/, ''), 10);
      filtered = filtered.filter((g) => g.edition === edNum);
    } else {
      filtered = filtered.filter((g) =>
        (g.name && g.name.toLowerCase().includes(search)) ||
        (g.fullName && g.fullName.toLowerCase().includes(search)) ||
        (g.active_holder && g.active_holder.toLowerCase().includes(search)) ||
        (g.glyph_hash && g.glyph_hash.toLowerCase().includes(search)) ||
        (g.state_root_hash && g.state_root_hash.toLowerCase().includes(search)) ||
        (g.is_living_agent && (search === 'agent' || search === 'agents' || search === 'living' || search === 'synced' || search === 'sync' || search === 'epoch')) ||
        (g.txid && g.txid.toLowerCase().includes(search))
      );
    }
  }

  if (rarityFilter && rarityFilter !== 'all') {
    if (rarityFilter === 'agent' || rarityFilter === 'agents' || rarityFilter === 'synced' || rarityFilter === 'sync') {
      filtered = filtered.filter((g) => g.is_living_agent);
    } else {
      filtered = filtered.filter((g) => {
        const itemRarity = String(g.rarity || 'common').trim().toLowerCase();
        return itemRarity === rarityFilter;
      });
    }
  }

  // Sort
  if (sort === 'edition_desc') {
    filtered.sort((a, b) => b.edition - a.edition);
  } else if (sort === 'newest') {
    filtered.sort((a, b) => b.block_height - a.block_height);
  } else {
    filtered.sort((a, b) => a.edition - b.edition);
  }

  const total = filtered.length;
  const pageSlice = filtered.slice(offset, offset + limit);

  // Enrich ONLY the requested page with metadata and SVG
  const paginatedItems: GlyphCatalogItem[] = await Promise.all(
    pageSlice.map(async (item) => {
      const artifact = (await fetchGlyphArtifact(item.glyph_hash)) ||
                       (await fetchGlyphArtifact(item.edition)) || null;

      const cleanName = item.name || artifact?.name?.replace(new RegExp(`\\s*#${item.edition}\\b`, 'i'), '').trim() || `PoUS Glyph #${item.edition}`;
      const rawName = item.fullName || artifact?.name || `PoUS Glyph #${item.edition}`;
      const theme = item.theme || artifact?.theme || (item.edition <= 100 ? 'Genesis Matrix' : 'Autonomous AI Worker');
      const archetype = item.archetype || artifact?.archetype || 'PoUS L1 Consensus';
      const rarity = item.rarity || artifact?.rarity || 'Common';
      const status: 'ACTIVE' | 'BURNED' = item.is_burned ? 'BURNED' : 'ACTIVE';
      const svgContent = artifact?.svgContent || generateFallbackSvg(item.edition, cleanName);

      return {
        edition: item.edition,
        glyphHash: item.glyph_hash,
        txid: item.txid,
        blockHeight: item.block_height,
        blockTime: item.block_time,
        opLabel: item.op_label,
        carrierAddress: item.is_burned ? null : (item.active_holder || item.carrier_address),
        carrierVout: item.is_burned ? 0 : item.carrier_vout,
        carrierAmount: item.is_burned ? 0 : (item.carrier_amount || 10000),
        historyCount: item.history_count,
        name: cleanName,
        fullName: rawName,
        theme,
        archetype,
        rarity,
        status,
        isBurned: Boolean(item.is_burned),
        svgContent,
        imageRef: artifact?.imageRef || null,
        is_living_agent: Boolean(item.is_living_agent),
        cycle_count: Number(item.cycle_count || 0),
        state_root_hash: item.state_root_hash || null,
        agent_status: status,
      };
    })
  );

  return {
    items: paginatedItems,
    pagination: {
      total,
      limit,
      offset,
    },
    stats: {
      totalMinted,
      uniqueHolders: uniqueHoldersSet.size,
      consensusRatio: '100% PoUS',
      carrierBaseSat: 10000,
    },
    filters: {
      search,
      rarity: rarityFilter || 'all',
      sort,
    },
  };
}

export async function getGlyphDetail(
  idOrEdition: string | number,
  customDb?: any
): Promise<GlyphDetailResponse | null> {
  const activeDb = customDb || defaultDb;
  const param = String(idOrEdition).trim();
  let glyphRows: any[] = [];

  if (/^\d{1,5}$/.test(param) && Number(param) <= 65535) {
    const edition = parseInt(param, 10);
    glyphRows = await activeDb.all(`
      SELECT g.*, b.time as block_timestamp
      FROM glyphs g
      LEFT JOIN blocks b ON g.block_height = b.height
      WHERE g.edition = ?
      ORDER BY g.block_height DESC, g.rowid DESC
    `, edition);
  } else {
    glyphRows = await activeDb.all(`
      SELECT g.*, b.time as block_timestamp
      FROM glyphs g
      LEFT JOIN blocks b ON g.block_height = b.height
      WHERE g.glyph_hash = ? OR g.txid = ?
      ORDER BY g.block_height DESC, g.rowid DESC
    `, param, param);
  }

  if (!glyphRows.length) {
    return null;
  }

  const latest = glyphRows[0];
  // Multi-collection isolation: scope all historical events strictly to the target record's glyph_hash
  glyphRows = glyphRows.filter((r) => r.glyph_hash === latest.glyph_hash);
  const isBurned = latest.op_label === 'BURN';

  // Defense-in-Depth: Fallback to latest non-empty state_root_hash and max cycle_count across history
  const latestWithRoot = glyphRows.find((r) => r.state_root_hash);
  const stateRootHash = latest.state_root_hash || latestWithRoot?.state_root_hash || null;
  const maxCycles = Math.max(...glyphRows.map((r) => Number(r.cycle_count || 0)), 0);
  const cycleCount = Number(latest.cycle_count || maxCycles || 0);

  const isLivingAgent = Boolean(
    cycleCount > 0 ||
    stateRootHash ||
    latest.op_label === 'STATE_SYNC' ||
    glyphRows.some((r) => r.op_label === 'STATE_SYNC')
  );
  const agentStatus: 'ACTIVE' | 'BURNED' = isBurned ? 'BURNED' : 'ACTIVE';

  const artifact = (await fetchGlyphArtifact(latest.glyph_hash)) ||
                   (await fetchGlyphArtifact(latest.edition)) || null;

  const rawName = artifact?.name || `PoUS Glyph #${latest.edition}`;
  const cleanName = rawName.replace(new RegExp(`\\s*#${latest.edition}\\b`, 'i'), '').trim();

  // Check active UTXO
  const utxo = isBurned ? null : await activeDb.get(`
    SELECT address, amount FROM utxos WHERE txid = ? AND vout_index = ?
  `, latest.txid, latest.carrier_vout) as any;

  const prov = artifact?.provenance || {};
  const originDao = prov.origin_dao || artifact?.originDao || (latest.edition <= 100 ? 'quavence' : 'quavence');
  const isOgNode = artifact?.holderType === 'og_node_operator' || prov.holder_type === 'og_node_operator';
  const originDrop = prov.origin_drop || artifact?.originDrop || (isOgNode ? 'OG_NODE_GENESIS_001' : (latest.edition <= 100 ? 'Genesis Series' : 'Quavence PoUS Collection'));
  const mintedAt = prov.minted_at || artifact?.mintedAt || (latest.block_time ? new Date(latest.block_time * 1000).toISOString() : new Date().toISOString());
  const rarity = artifact?.rarity || latest.rarity || 'Common';

  return {
    edition: latest.edition,
    glyphHash: latest.glyph_hash,
    mintTxid: glyphRows[glyphRows.length - 1].txid,
    latestTxid: latest.txid,
    blockHeight: latest.block_height,
    blockTime: latest.block_time,
    currentHolder: isBurned ? null : (utxo?.address || latest.carrier_address),
    carrierAmount: isBurned ? 0 : (utxo?.amount || 10000),
    carrierVout: isBurned ? 0 : latest.carrier_vout,
    name: cleanName,
    fullName: rawName,
    theme: artifact?.theme || latest.theme || (latest.edition <= 100 ? 'Genesis Matrix' : 'Autonomous AI Worker'),
    archetype: artifact?.archetype || latest.archetype || 'PoUS L1 Consensus',
    rarity,
    status: agentStatus,
    isBurned: Boolean(isBurned),
    holderType: artifact?.holderType || prov.holder_type || (isOgNode ? 'og_node_operator' : null),
    is_living_agent: isLivingAgent,
    cycle_count: cycleCount,
    cycleCount: cycleCount,
    state_root_hash: stateRootHash,
    stateRootHash: stateRootHash,
    agent_status: agentStatus,
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
      stateRootHash: r.state_root_hash || null,
      cycleCount: Number(r.cycle_count || 0),
    })),
  };
}
