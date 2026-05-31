import { QUAVENCE } from '../config.js';

export function toSatoshis(val: number | string | undefined | null): number {
  if (val === undefined || val === null) return 0;
  const numVal = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(numVal)) return 0;
  return Math.round(numVal * QUAVENCE.coin);
}

export function isCoinBase(tx: any): boolean {
  return !!(tx.vin && tx.vin.length > 0 && tx.vin[0].coinbase);
}

export function isCoinStake(tx: any): boolean {
  if (isCoinBase(tx)) return false;
  if (!tx.vin || tx.vin.length === 0) return false;
  if (!tx.vout || tx.vout.length < 2) return false;

  const firstOut = tx.vout[0];
  // Coinstake vout[0] is typically empty (0 value, empty scriptPubKey)
  const isEmptyVal = firstOut.value === 0 || firstOut.value === '0.00000000' || firstOut.value === 0.0;
  const isEmptyScript = !firstOut.scriptPubKey || 
                        !firstOut.scriptPubKey.hex || 
                        firstOut.scriptPubKey.hex === '' ||
                        firstOut.scriptPubKey.asm === '';

  return isEmptyVal && isEmptyScript;
}

export function classifyBlock(block: any, height: number): string {
  if (height === 0) return 'genesis';

  // Check if any transaction is a coinstake
  const hasCoinStake = block.tx.some((tx: any) => isCoinStake(tx));
  if (hasCoinStake) return 'pos';

  // Fallback hint for bootstrap
  if (height <= QUAVENCE.bootstrapHeightHint) {
    return 'bootstrap';
  }

  return 'pow';
}

export function classifyTransaction(tx: any, blockHeight: number, blockType: string): string {
  if (isCoinStake(tx)) {
    return 'stake_reward';
  }
  if (isCoinBase(tx)) {
    if (blockHeight === 0) return 'bootstrap';
    if (blockType === 'bootstrap' || blockHeight <= QUAVENCE.bootstrapHeightHint) {
      return 'bootstrap';
    }
    return 'coinbase';
  }
  return 'normal_transfer';
}
