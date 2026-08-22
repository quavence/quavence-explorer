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

    // Compute average block interval over recent PoS blocks with downtime gap filtering
    const recentPoSBlocks = await db.all(`
      SELECT time 
      FROM blocks 
      WHERE block_type = 'pos' 
      ORDER BY height DESC 
      LIMIT 50
    `) as { time: number }[];
    
    let avgInterval = QUAVENCE.targetSpacingSeconds;
    if (recentPoSBlocks.length > 1) {
      const intervals: number[] = [];
      for (let i = 0; i < recentPoSBlocks.length - 1; i++) {
        const diff = recentPoSBlocks[i].time - recentPoSBlocks[i + 1].time;
        // Filter out network downtime gaps (> 6x target spacing = 384s)
        if (diff > 0 && diff <= QUAVENCE.targetSpacingSeconds * 6) {
          intervals.push(diff);
        }
      }
      if (intervals.length > 0) {
        intervals.sort((a, b) => a - b);
        const mid = Math.floor(intervals.length / 2);
        avgInterval = intervals.length % 2 !== 0
          ? intervals[mid]
          : Math.round((intervals[mid - 1] + intervals[mid]) / 2);
      }
    }

    // Supply metrics
    const premineSat = QUAVENCE.premine * QUAVENCE.coin;

    // Use real UTXO set total from database as circulating supply
    const utxoRow = await db.get('SELECT SUM(amount) as total FROM utxos') as { total: number | null };
    const posSubsidyRow = await db.get("SELECT SUM(subsidy) as total FROM blocks WHERE block_type = 'pos' AND height > 0 AND subsidy IS NOT NULL") as { total: number | null };

    // Circulating supply = real on-chain UTXO set total (or fallback to premine + PoS subsidy)
    const circulatingSupply = (utxoRow && utxoRow.total && utxoRow.total > 0)
      ? utxoRow.total
      : (premineSat + (posSubsidyRow?.total || 0));

    const posSubsidyEmitted = circulatingSupply > premineSat
      ? (circulatingSupply - premineSat)
      : (posSubsidyRow && posSubsidyRow.total ? posSubsidyRow.total : 0);

    // Fees collected (coinstake total rewards minus pos subsidy)
    const feesRow = await db.get("SELECT SUM(reward - subsidy) as total FROM blocks WHERE block_type = 'pos' AND height > 0 AND reward IS NOT NULL AND subsidy IS NOT NULL") as { total: number | null };
    const feesCollected = feesRow && feesRow.total ? feesRow.total : 0;

    const stakerIncome = posSubsidyEmitted + feesCollected;

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

    // PoUS Consensus & AI Attestation metrics in sliding window (1,440 blocks)
    const pousWindowBlocks = 1440;
    const startPousHeight = Math.max(0, dbHeight - pousWindowBlocks);
    let pousStats = {
      attestationsInWindow: 0,
      windowBlocks: pousWindowBlocks,
      activeBoostPercent: 0,
      totalAttestations: 0,
      minAttestationsForBoost: 3,
      maxBoostPercent: 50,
      avgWorkers: 0,
      status: 'STANDBY',
    };

    try {
      const pousWindowRow = await db.get(`
        SELECT COUNT(*) as count, AVG(worker_count) as avg_workers 
        FROM ai_attestations 
        WHERE block_height > ?
      `, startPousHeight) as { count: number | null; avg_workers: number | null } | undefined;

      const totalRow = await db.get('SELECT COUNT(*) as total FROM ai_attestations') as { total: number | null } | undefined;

      const countInWindow = pousWindowRow?.count || 0;
      const avgWorkers = pousWindowRow?.avg_workers || 0;
      const totalAttestations = totalRow?.total || 0;

      let boost = 0;
      if (countInWindow >= 3) {
        boost = Math.min(50, 20 + Math.floor((countInWindow - 3) * 2));
      }

      pousStats = {
        attestationsInWindow: countInWindow,
        windowBlocks: pousWindowBlocks,
        activeBoostPercent: boost,
        totalAttestations,
        minAttestationsForBoost: 3,
        maxBoostPercent: 50,
        avgWorkers: Math.round(avgWorkers * 10) / 10,
        status: boost > 0 ? 'ACTIVE' : 'STANDBY',
      };
    } catch (e) {
      // If table empty or unindexed yet, default fallback stands
    }

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
      pous: pousStats,
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
