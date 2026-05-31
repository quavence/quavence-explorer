import { Router } from 'express';
import { db, getIndexerHeight } from '../../db/db.js';
import { getBlockchainInfo, getStakingInfo, getPeerInfo } from '../../indexer/rpc.js';
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
  };
}

router.get('/', async (req, res) => {
  try {
    const dbHeight = await getIndexerHeight();
    
    let nodeInfo: any = { blocks: 0, difficulty: 0, connections: 0 };
    let nodeOnline = false;
    try {
      nodeInfo = await getBlockchainInfo();
      nodeOnline = true;
    } catch (err) {}

    const stakingInfo = nodeOnline ? await getStakingInfo() : null;
    const peers = nodeOnline ? await getPeerInfo() : [];

    // Parse difficulty robustly (supports number and object structures)
    let difficulty_pos = 0;
    let difficulty_pow = 0;
    if (nodeOnline && nodeInfo.difficulty) {
      if (typeof nodeInfo.difficulty === 'object') {
        difficulty_pos = nodeInfo.difficulty['proof-of-stake'] || 0;
        difficulty_pow = nodeInfo.difficulty['proof-of-work'] || 0;
      } else if (typeof nodeInfo.difficulty === 'number') {
        difficulty_pos = nodeInfo.difficulty;
        difficulty_pow = nodeInfo.difficulty;
      }
    }

    // Compute average block interval over last 50 PoS blocks only (excluding genesis/bootstrap)
    const recentPoSBlocks = await db.all(`
      SELECT time 
      FROM blocks 
      WHERE block_type = 'pos' 
      ORDER BY height DESC 
      LIMIT 50
    `) as { time: number }[];
    
    let avgInterval = QUAVENCE.targetSpacingSeconds;
    if (recentPoSBlocks.length > 1) {
      let diffSum = 0;
      for (let i = 0; i < recentPoSBlocks.length - 1; i++) {
        diffSum += (recentPoSBlocks[i].time - recentPoSBlocks[i + 1].time);
      }
      avgInterval = Math.round(diffSum / (recentPoSBlocks.length - 1));
    }

    // Supply metrics
    const premineSat = QUAVENCE.premine * QUAVENCE.coin;

    // PoS subsidy emitted (only new minted coins from pos blocks)
    const posSubsidyRow = await db.get("SELECT SUM(subsidy) as total FROM blocks WHERE block_type = 'pos' AND height > 0 AND subsidy IS NOT NULL") as { total: number | null };
    const posSubsidyEmitted = posSubsidyRow && posSubsidyRow.total ? posSubsidyRow.total : 0;

    // Fees collected (coinstake total rewards minus pos subsidy)
    const feesRow = await db.get("SELECT SUM(reward - subsidy) as total FROM blocks WHERE block_type = 'pos' AND height > 0 AND reward IS NOT NULL AND subsidy IS NOT NULL") as { total: number | null };
    const feesCollected = feesRow && feesRow.total ? feesRow.total : 0;

    const stakerIncome = posSubsidyEmitted + feesCollected;

    // Circulating supply = premine + PoS subsidy emitted (does not include fees as new emission)
    const circulatingSupply = premineSat + posSubsidyEmitted;

    // Get timestamp of last indexed block
    const lastBlockRow = await db.get('SELECT time FROM blocks ORDER BY height DESC LIMIT 1') as { time: number } | undefined;
    const lastIndexedBlockTime = lastBlockRow ? lastBlockRow.time : null;

    // Calculate sync percentage
    const chainHeight = nodeOnline ? nodeInfo.blocks : dbHeight;
    let syncPercentage = 0;
    if (chainHeight > 0) {
      syncPercentage = Math.min(100, Math.max(0, (dbHeight / chainHeight) * 100));
    } else if (dbHeight >= 0) {
      syncPercentage = 100;
    }

    const lastBlockAgeSeconds = lastIndexedBlockTime !== null
      ? Math.max(0, Math.floor(Date.now() / 1000) - lastIndexedBlockTime)
      : null;

    const networkStakeWeight = (stakingInfo && stakingInfo.netstakeweight !== undefined)
      ? (stakingInfo.netstakeweight / QUAVENCE.coin)
      : 0;

    res.json({
      nodeOnline,
      height: dbHeight,
      networkHeight: chainHeight,
      syncPercentage,
      lastIndexedBlockTime,
      lastBlockAgeSeconds,
      networkStakeWeight,
      targetSpacingSeconds: QUAVENCE.targetSpacingSeconds,
      avgSpacingWindowLabel: "PoS avg, last 50",
      rpcStatus: nodeOnline ? 'online' : 'offline',
      difficulty_pos,
      difficulty_pow,
      difficulty: difficulty_pos, // legacy fallback
      peersCount: nodeOnline ? (nodeInfo.connections !== undefined ? nodeInfo.connections : peers.length) : 0,
      staking: stakingInfo,
      averageBlockInterval: avgInterval,
      supply: {
        ticker: QUAVENCE.ticker,
        maxSupply: QUAVENCE.maxSupply * QUAVENCE.coin,
        premine: premineSat,
        posSubsidyEmitted,
        feesCollected,
        stakerIncome,
        circulating: circulatingSupply,
        decimals: QUAVENCE.decimals,
      },
      emission: getEmissionSchedule(dbHeight),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
