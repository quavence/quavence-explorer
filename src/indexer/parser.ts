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
  const hasCoinStake = block.tx && Array.isArray(block.tx) && block.tx.some((tx: any) => isCoinStake(tx));
  if (hasCoinStake) return 'pos';

  return 'pow';
}

export function classifyTransaction(tx: any, blockHeight: number, blockType: string): string {
  if (isCoinStake(tx)) {
    return 'stake_reward';
  }
  if (isCoinBase(tx)) {
    if (blockHeight === 0) return 'genesis';
    return 'coinbase';
  }
  return 'normal_transfer';
}

export interface AiAttestationData {
  magic: string;
  version: number;
  taskType: string;
  taskTypeCode: number;
  consensusHash: string;
  workerCount: number;
  agreementRatio: number;
  refBlockHeight: number;
}

export function parseAiAttestationFromVout(vout: any): AiAttestationData | null {
  if (!vout || !vout.scriptPubKey) return null;
  const hex = String(vout.scriptPubKey.hex || '').trim();
  const asm = String(vout.scriptPubKey.asm || '').trim();

  if (!hex.startsWith('6a') && !asm.startsWith('OP_RETURN')) {
    return null;
  }

  let dataBuf: Buffer | null = null;
  if (hex.startsWith('6a')) {
    try {
      const raw = Buffer.from(hex, 'hex');
      let offset = 1;
      if (raw.length > 2 && raw[1] <= 75) {
        offset = 2;
      } else if (raw.length > 3 && raw[1] === 0x4c) {
        offset = 3;
      }
      dataBuf = raw.subarray(offset);
    } catch {
      dataBuf = null;
    }
  }

  if (!dataBuf || dataBuf.length < 44) {
    return null;
  }

  if (dataBuf.subarray(0, 4).toString('ascii') !== 'QVAI') {
    return null;
  }

  const version = dataBuf.readUInt8(4);
  const typeCode = dataBuf.readUInt8(5);
  const consensusHash = dataBuf.subarray(6, 38).toString('hex');
  const workerCount = dataBuf.readUInt8(38);
  const agreementRatio = Number((dataBuf.readUInt8(39) / 255).toFixed(4));
  const refBlockHeight = dataBuf.readUInt32BE(40);

  const TASK_TYPES: Record<number, string> = {
    1: 'TASK_RISK_FLAGS',
    2: 'TASK_SUMMARY',
    3: 'TASK_RAG_IDLE_VERIFICATION',
    4: 'TASK_HISTORICAL_CONTEXT',
    5: 'TASK_OUTCOME_RECAP',
    6: 'TASK_BOUNTY_COMPOSER_TURN',
    7: 'TASK_BOUNTY_REVIEW_CONSULTANT_TURN',
    8: 'TASK_BOUNTY_SUBMISSION_SCREEN',
    9: 'TASK_AI_GLYPH_GEN',
  };

  return {
    magic: 'QVAI',
    version,
    taskType: TASK_TYPES[typeCode] || 'TASK_SUMMARY',
    taskTypeCode: typeCode,
    consensusHash,
    workerCount,
    agreementRatio,
    refBlockHeight,
  };
}

export interface GlyphOpReturnData {
  magic: 'QVNC';
  version: number;
  opType: number;
  opLabel: 'CLAIM' | 'TRANSFER' | 'BURN' | 'UNKNOWN';
  glyphHash: string;
  edition: number;
  rawHex: string;
}

export function parseGlyphFromVout(vout: any): GlyphOpReturnData | null {
  if (!vout || !vout.scriptPubKey) return null;
  const hex = String(vout.scriptPubKey.hex || '').trim();
  const asm = String(vout.scriptPubKey.asm || '').trim();

  if (!hex.startsWith('6a') && !asm.startsWith('OP_RETURN')) {
    return null;
  }

  let dataBuf: Buffer | null = null;
  if (hex.startsWith('6a')) {
    try {
      const raw = Buffer.from(hex, 'hex');
      let offset = 1;
      if (raw.length > 2 && raw[1] <= 75) {
        offset = 2;
      } else if (raw.length > 3 && raw[1] === 0x4c) {
        offset = 3;
      }
      dataBuf = raw.subarray(offset);
    } catch {
      dataBuf = null;
    }
  }

  if (!dataBuf || dataBuf.length < 40) {
    return null;
  }

  if (dataBuf.subarray(0, 4).toString('ascii') !== 'QVNC') {
    return null;
  }

  const version = dataBuf.readUInt8(4);
  const opType = dataBuf.readUInt8(5);
  const glyphHash = dataBuf.subarray(6, 38).toString('hex');
  const edition = dataBuf.readUInt16LE(38);

  const OP_LABELS: Record<number, 'CLAIM' | 'TRANSFER' | 'BURN'> = {
    1: 'CLAIM',
    2: 'BURN',
    3: 'TRANSFER',
  };

  return {
    magic: 'QVNC',
    version,
    opType,
    opLabel: OP_LABELS[opType] || 'UNKNOWN',
    glyphHash,
    edition,
    rawHex: hex,
  };
}


