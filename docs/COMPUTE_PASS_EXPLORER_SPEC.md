# Quavence Explorer: Compute Pass & De-Tamagotchi Alignment Specification

## 1. Context & Purpose
In accordance with `SPEC_GLYPH_COMPUTE_PASS_QT.md` (Section 1.1 "Отказ от метафоры Тамагочи"):
The legacy anthropomorphic metaphors ("Living Sovereign Agent", "Dream Cycles", "AWAKE / HIBERNATED") are removed from the Quavence Explorer frontend and API layer.

The PoUS Glyph is presented in its true protocol utility: **Compute Pass (ончейн-абонемент на AI-вычисления в сети L1 Quavence)**.

## 2. Invariants & Security Boundaries (Zero Regression)
1. **Consensus & Protocol Invariants**:
   - OpCode `0x05` binary decoding in `parser.ts` remains strictly intact (44-byte payload: edition, cycleCount, stateRootHash, flags).
   - Carrier lineage verification, monotonic `cycle_count >= currentCycle`, and carrier UTXO verification in `indexer.ts` remain 100% untouched.
   - Database schema columns `cycle_count`, `state_root_hash` remain intact.
2. **Red Team Security Invariants**:
   - `BoundedCache` (LRU, 1000 items, 10 min TTL) with abort signals in metadata fetching is preserved.
   - `toSatoshis` integer bounds and overflow checks remain strictly enforced.
   - Sanitized error responses (500 without internal stack traces) remain intact.
   - Anti-SSRF localhost validation via `getDaoCandidateUrls()` remains intact.

## 3. Presentation Mapping

### 3.1 Rarity Tiers to Compute Pass Daily Quota
| Rarity | Daily Quota (USD / day) | Network Access |
| :--- | :--- | :--- |
| **Common** | `$0.05` | Basic queries & summaries |
| **Rare** | `$0.15` | Medium documents & queries |
| **Epic** | `$0.35` | Deep analytical workloads |
| **Legendary** | `$0.75` | Premium compute allocation |

### 3.2 State Sync vs Legacy Terms
| Legacy Concept | New Technical Concept |
| :--- | :--- |
| `Living Sovereign Agent` | `Compute Pass` (Utility) |
| `● AWAKE` / `● HIBERNATED` | `● ACTIVE` / `● BURNED` |
| `Dream Cycles: #N` | `State Sync Epoch: #N` |
| `Cognitive State Root` | `State Root Hash` |
| `TASK_SI_DREAM_CONSOLIDATION` | `MEMORY CONSOLIDATION` (UI Label) |

## 4. Verification Plan
1. `npm test`: All 8 test suites must pass (100% GREEN).
2. `npm run build`: Production Vite + TS bundle must build without any errors.
3. Verify responsive UI rendering and clean badge hierarchy.
