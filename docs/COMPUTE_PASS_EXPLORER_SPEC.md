# Quavence Explorer: Pure On-Chain Ledger & De-Tamagotchi Specification

## 1. Context & Architectural Rationale
1. **Elimination of "Tamagotchi" Metaphors**:
   - The legacy anthropomorphic metaphors ("Living Sovereign Agent", "Dream Cycles", "AWAKE / HIBERNATED") are completely removed.
2. **Decoupling Application-Layer Quotas from Core L1 Explorer**:
   - The blockchain explorer is a pure, objective reflection of the L1 ledger.
   - Application-layer utilities (such as dynamic compute credit quotas, USD rates, and service policies) are managed at the App / Hub / DAO level and are intentionally NOT hardcoded into the Explorer.
   - The Explorer reflects strictly immutable on-chain truth.

## 2. On-Chain Ledger Presentation
| Parameter | Nature | Presentation in Explorer |
| :--- | :--- | :--- |
| **Edition Number** | On-Chain UTXO Lineage | `#{edition}` |
| **Rarity Tier** | On-Chain Provenance / Metadata | `COMMON`, `RARE`, `EPIC`, `LEGENDARY` |
| **On-Chain Status** | UTXO Life State | `ACTIVE` (Carrier UTXO unspent) / `● BURNED` (OpCode 0x04) |
| **Carrier UTXO** | Layer-1 Output | `10,000 sat (0.00010000 QVNC)` |
| **State Sync Epoch** | OpCode 0x05 Monotonic Nonce | `Epoch #{cycle_count}` (if anchored) |
| **State Root Hash** | OpCode 0x05 Binary Payload | 32-byte hex hash (with copy control) |

## 3. Invariants & Security Boundaries (Zero Regression)
1. **Consensus & Protocol Invariants**:
   - OpCode `0x05` binary decoding in `parser.ts` remains strictly intact (44 bytes total: magic 4B, version 1B, opType 1B, edition 2B, stateRootHash 32B, cycleCount 4B).
   - Carrier lineage verification, monotonic `cycle_count >= currentCycle`, and carrier UTXO verification in `indexer.ts` remain 100% untouched.
   - Database schema columns `cycle_count`, `state_root_hash` remain intact.
2. **Red Team Security Invariants**:
   - `BoundedCache` (LRU, 1000 items, 10 min TTL) with abort signals in metadata fetching is preserved.
   - `toSatoshis` integer bounds and overflow checks remain strictly enforced.
   - Sanitized error responses (500 without internal stack traces) remain intact.
   - Anti-SSRF localhost validation via `getDaoCandidateUrls()` remains intact.

## 4. Verification Plan
1. `npm test`: All 9 test suites pass (100% GREEN).
2. `npm run build`: Production Vite + TS bundle builds without any errors.
