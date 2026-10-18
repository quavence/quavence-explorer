/**
 * Minter Epoch Configuration & Height-Bounded Authorization
 * Vector 1: Multi-Epoch Minter Key Rotation
 *
 * Syntax:
 * - Plain address: "ADDR" -> valid across all heights [0, Infinity)
 * - Explicit era: "ADDR:0-100" -> valid from height 0 to 100 inclusive
 * - Open-ended era: "ADDR:101+" -> valid from height 101 to Infinity
 * - Multi-entry: separated by commas or newlines
 */

export interface MinterEpochConfig {
  address: string;
  startHeight: number;
  endHeight: number;
}

let cachedRawConfig: string | null = null;
let cachedConfigs: MinterEpochConfig[] = [];

export function parseMinterEpochs(rawConfig?: string): MinterEpochConfig[] {
  if (!rawConfig) return [];
  const entries = rawConfig
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const configs: MinterEpochConfig[] = [];

  for (const entry of entries) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx === -1) {
      // Plain address: valid across all heights [0, Infinity)
      configs.push({
        address: entry,
        startHeight: 0,
        endHeight: Infinity,
      });
      continue;
    }

    const address = entry.slice(0, colonIdx).trim();
    const rangeStr = entry.slice(colonIdx + 1).trim();

    if (!address) {
      throw new Error(`Invalid minter config entry: empty address in "${entry}"`);
    }

    if (rangeStr.endsWith('+')) {
      const startStr = rangeStr.slice(0, -1).trim();
      const startHeight = parseInt(startStr, 10);
      if (!Number.isInteger(startHeight) || startHeight < 0) {
        throw new Error(`Invalid minter epoch start height in "${entry}": must be a non-negative integer`);
      }
      configs.push({
        address,
        startHeight,
        endHeight: Infinity,
      });
    } else if (rangeStr.includes('-')) {
      const parts = rangeStr.split('-');
      if (parts.length !== 2) {
        throw new Error(`Invalid minter epoch range format in "${entry}"`);
      }
      const startHeight = parseInt(parts[0].trim(), 10);
      const endHeight = parseInt(parts[1].trim(), 10);
      if (!Number.isInteger(startHeight) || !Number.isInteger(endHeight) || startHeight < 0 || endHeight < startHeight) {
        throw new Error(`Invalid minter epoch range in "${entry}": start and end must be integers with start <= end`);
      }
      configs.push({
        address,
        startHeight,
        endHeight,
      });
    } else {
      // Single number after colon: e.g. ADDRESS:100 treated as [100, Infinity)
      const startHeight = parseInt(rangeStr, 10);
      if (!Number.isInteger(startHeight) || startHeight < 0) {
        throw new Error(`Invalid minter epoch start height in "${entry}": must be a non-negative integer`);
      }
      configs.push({
        address,
        startHeight,
        endHeight: Infinity,
      });
    }
  }

  return configs;
}

export function isMinterAuthorizedAtHeight(
  address: string,
  height: number,
  configs: MinterEpochConfig[]
): boolean {
  if (!address || typeof height !== 'number' || height < 0) return false;
  return configs.some(
    (cfg) => cfg.address === address && height >= cfg.startHeight && height <= cfg.endHeight
  );
}

/**
 * Returns current minter epoch configurations from environment variables.
 * Caches parsed configs until environment string changes.
 */
export function getConfiguredMinters(): MinterEpochConfig[] {
  const raw = process.env.GLYPH_MINTER_EPOCHS || process.env.GLYPH_MINTER_ADDRESS || process.env.QVNC_COLLECTION_ISSUER_ADDRESS || '';
  if (raw === cachedRawConfig) {
    return cachedConfigs;
  }
  cachedRawConfig = raw;
  cachedConfigs = parseMinterEpochs(raw);
  return cachedConfigs;
}

export function resetMinterConfigCache(): void {
  cachedRawConfig = null;
  cachedConfigs = [];
}
