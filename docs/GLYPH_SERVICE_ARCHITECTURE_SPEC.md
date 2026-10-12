# Architectural Specification: PoUS Glyph Service Layer (`glyphService.ts`)

## 1. Context & Motivation
Following the Red Team security audit, Express routes in `src/api/routes/glyphs.ts` contained inline SQL aggregation, state mapping, search/filter logic, and cache management. This resulted in:
1. Tight coupling between the HTTP transport layer and core business logic.
2. Inability to directly test catalog queries, filtering, and lineage rules in unit/integration tests without either spinning up the entire HTTP server or duplicating SQL queries in test suites (`test_compute_pass_explorer.ts`, `test_glyph_rarity_filter.ts`).

## 2. Architectural Objectives
1. **Separation of Concerns**: Isolate query aggregation, lineage calculation, metadata caching, and carrier invariants into `src/services/glyphService.ts`.
2. **Dependency Injection (DI)**: Enable passing an arbitrary database instance (`customDb?: Database`) into service functions. If omitted, default to the singleton `db` instance from `src/db/db.js`.
3. **Thin HTTP Controllers**: `src/api/routes/glyphs.ts` becomes a thin controller validating request params/queries, delegating to `glyphService`, and returning formatted JSON responses.
4. **Zero Test Duplication**: Integration tests (`scripts/test_compute_pass_explorer.ts`) import `glyphService` directly and run on `:memory:` SQLite instances with 100% code reuse.
5. **Zero Side-Effects (Rule 15)**: Importing `glyphService.ts` must be completely passive: no timers, no port listening, no side-effects.

---

## 3. Interfaces & Contracts

### 3.1 Input Options
```typescript
export interface GlyphCatalogOptions {
  limit?: number;
  offset?: number;
  search?: string;
  rarity?: string;
  sort?: string;
}
```

### 3.2 Output Models
- `GlyphCatalogItem`: Enriched representation of a unique glyph edition in catalog view.
- `GlyphCatalogResponse`: Paginated catalog with network stats and applied filters.
- `GlyphDetailResponse`: Full on-chain history, current UTXO carrier state, provenance, and SVG content.

### 3.3 Core Service Methods
```typescript
export async function getGlyphsCatalog(
  options: GlyphCatalogOptions = {},
  customDb?: Database | any
): Promise<GlyphCatalogResponse>;

export async function getGlyphDetail(
  idOrEdition: string | number,
  customDb?: Database | any
): Promise<GlyphDetailResponse | null>;
```

---

## 4. Invariants & Security Rules
1. **H-2 Carrier Zeroing**: For burned glyphs (`is_burned === true`), `carrierAddress: null`, `carrierVout: 0`, and `carrierAmount: 0`.
2. **M-2 Filter Aliases**: Both `rarityFilter` and `search` must recognize `'synced'`, `'sync'`, and `'epoch'` for Living Agent / Synced glyphs.
3. **Status Taxonomy**: Strictly `'ACTIVE'` or `'BURNED'`, never `'AWAKE'` or `'HIBERNATED'`.
4. **Cache Safety**: `BoundedCache` must cap metadata memory at 1,000 entries and 600,000 ms TTL.
