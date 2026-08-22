import { Router } from 'express';
import { db } from '../../db/db.js';
import { QUAVENCE } from '../../config.js';

const router = Router();

function getPosRewardForEra(era: number): number {
  let reward = QUAVENCE.posSubsidyInitial;
  for (let i = 0; i < era; i += 1) {
    reward = Math.floor((reward * QUAVENCE.posSubsidyDecayNum) / QUAVENCE.posSubsidyDecayDen);
    if (reward < 1) {
      reward = 1;
    }
  }
  return reward;
}

function getEmissionSchedule(height: number) {
  const subsidyHeight = Math.max(QUAVENCE.posSubsidyFirstHeight, height);
  const currentEra = Math.max(0, Math.floor((subsidyHeight - QUAVENCE.posSubsidyFirstHeight) / QUAVENCE.posSubsidyEraBlocks));
  const eraStartHeight = QUAVENCE.posSubsidyFirstHeight + currentEra * QUAVENCE.posSubsidyEraBlocks;
  const eraEndHeight = eraStartHeight + QUAVENCE.posSubsidyEraBlocks - 1;
  const blocksIntoEra = Math.max(0, Math.min(QUAVENCE.posSubsidyEraBlocks, height - eraStartHeight + 1));
  const nextEra = currentEra + 1;
  const nextReductionHeight = eraEndHeight + 1;
  const blocksUntilNextReduction = Math.max(0, nextReductionHeight - height);

  return {
    currentEra,
    eraStartHeight,
    eraEndHeight,
    eraBlocks: QUAVENCE.posSubsidyEraBlocks,
    blocksIntoEra,
    currentReward: getPosRewardForEra(currentEra),
    nextReductionHeight,
    blocksUntilNextReduction,
    nextReward: getPosRewardForEra(nextEra),
    decayPercent: 100 - (QUAVENCE.posSubsidyDecayNum / QUAVENCE.posSubsidyDecayDen) * 100,
    approxEraDays: (QUAVENCE.posSubsidyEraBlocks * QUAVENCE.targetSpacingSeconds) / 86400,
    devFee: {
      active: height >= QUAVENCE.devFeeActivationHeight,
      activationHeight: QUAVENCE.devFeeActivationHeight,
      percent: QUAVENCE.devFeePercent,
      treasuryAddress: QUAVENCE.devFeeAddress,
      stakerReward: height >= QUAVENCE.devFeeActivationHeight
        ? Math.floor(getPosRewardForEra(currentEra) * (100 - QUAVENCE.devFeePercent) / 100)
        : getPosRewardForEra(currentEra),
      treasuryReward: height >= QUAVENCE.devFeeActivationHeight
        ? Math.floor(getPosRewardForEra(currentEra) * QUAVENCE.devFeePercent / 100)
        : 0,
    },
  };
}

router.get('/', async (req, res) => {
  try {
    const premineSat = QUAVENCE.premine * QUAVENCE.coin;

    // Use actual on-chain UTXO total from database as circulating supply
    const utxoRow = await db.get('SELECT SUM(amount) as total FROM utxos') as { total: number | null };
    const posSubsidyRow = await db.get("SELECT SUM(subsidy) as total FROM blocks WHERE block_type = 'pos' AND height > 0 AND subsidy IS NOT NULL") as { total: number | null };

    const circulatingSupply = (utxoRow && utxoRow.total && utxoRow.total > 0)
      ? utxoRow.total
      : (premineSat + (posSubsidyRow?.total || 0));

    const posSubsidyEmitted = circulatingSupply > premineSat
      ? (circulatingSupply - premineSat)
      : (posSubsidyRow && posSubsidyRow.total ? posSubsidyRow.total : 0);

    const feesRow = await db.get("SELECT SUM(reward - subsidy) as total FROM blocks WHERE block_type = 'pos' AND height > 0 AND reward IS NOT NULL AND subsidy IS NOT NULL") as { total: number | null };
    const feesCollected = feesRow && feesRow.total ? feesRow.total : 0;

    const heightRow = await db.get('SELECT MAX(height) as height FROM blocks') as { height: number | null };
    const currentHeight = heightRow?.height ?? 0;

    res.json({
      circulating: circulatingSupply,
      circulatingFormatted: (circulatingSupply / QUAVENCE.coin).toFixed(8),
      premine: premineSat,
      premineFormatted: QUAVENCE.premine.toString(),
      posSubsidyEmitted,
      posSubsidyEmittedFormatted: (posSubsidyEmitted / QUAVENCE.coin).toFixed(8),
      feesCollected,
      feesCollectedFormatted: (feesCollected / QUAVENCE.coin).toFixed(8),
      maxSupply: QUAVENCE.maxSupply * QUAVENCE.coin,
      maxSupplyFormatted: QUAVENCE.maxSupply.toString(),
      ticker: QUAVENCE.ticker,
      emission: getEmissionSchedule(currentHeight),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
