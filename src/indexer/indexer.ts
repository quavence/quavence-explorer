import { db, initDb, getIndexerHeight, setIndexerHeight, clearAllData, rollbackToHeight } from '../db/db.js';
import { QUAVENCE } from '../config.js';
import { getBlockchainInfo, getBlockHash, getBlock } from './rpc.js';
import { toSatoshis, isCoinBase, isCoinStake, classifyBlock, classifyTransaction } from './parser.js';
import { computeBlockAmountFields, isRewardTransactionType } from './blockAmount.js';

// Helper to get block by height from DB
async function getBlockByHeight(height: number): Promise<{ hash: string } | undefined> {
  return db.get('SELECT hash FROM blocks WHERE height = ?', height);
}

function getPosSubsidySatoshis(height: number): number {
  if (height < QUAVENCE.posSubsidyFirstHeight) {
    return 0;
  }

  const era = Math.floor((height - QUAVENCE.posSubsidyFirstHeight) / QUAVENCE.posSubsidyEraBlocks);
  let reward = QUAVENCE.posSubsidyInitial;
  for (let i = 0; i < era; i += 1) {
    reward = Math.floor((reward * QUAVENCE.posSubsidyDecayNum) / QUAVENCE.posSubsidyDecayDen);
    if (reward < 1) {
      reward = 1;
    }
  }

  return reward;
}

// Transactional block save
export async function saveBlockToDb(block: any, height: number): Promise<void> {
  const block_type = classifyBlock(block, height);

  // Calculate block reward and subsidy (satoshis)
  let blockRewardSatoshis: number | null = 0;
  let blockSubsidySatoshis = 0;
  if (height === 0) {
    for (const tx of block.tx) {
      for (const out of tx.vout) {
        blockRewardSatoshis += toSatoshis(out.value);
      }
    }
    blockSubsidySatoshis = blockRewardSatoshis;
  } else if (block_type === 'pos') {
    blockSubsidySatoshis = getPosSubsidySatoshis(height);

    const coinstakeTx = block.tx.find((tx: any) => isCoinStake(tx));
    if (coinstakeTx) {
      let outSum = 0;
      for (const out of coinstakeTx.vout) {
        outSum += toSatoshis(out.value);
      }
      let inSum = 0;
      let allPrevoutsFound = true;
      for (const input of coinstakeTx.vin) {
        const prevout = await db.get('SELECT amount FROM utxos WHERE txid = ? AND vout_index = ?', input.txid, input.vout) as { amount: number } | undefined;
        if (prevout) {
          inSum += prevout.amount;
        } else {
          allPrevoutsFound = false;
        }
      }
      if (allPrevoutsFound) {
        blockRewardSatoshis = outSum - inSum;
      } else {
        blockRewardSatoshis = null; // Mark as null/pending
      }
    } else {
      blockRewardSatoshis = null;
    }
  } else {
    // PoW / Bootstrap block: subsidy is 0 (as premine is handled at block 0)
    blockSubsidySatoshis = 0;
    const coinbaseTx = block.tx.find((tx: any) => isCoinBase(tx));
    if (coinbaseTx) {
      for (const out of coinbaseTx.vout) {
        blockRewardSatoshis += toSatoshis(out.value);
      }
    }
  }

  // Parse difficulty robustly (supports number and object structures)
  let difficulty_pos = 0;
  let difficulty_pow = 0;
  if (block.difficulty) {
    if (typeof block.difficulty === 'object') {
      difficulty_pos = block.difficulty['proof-of-stake'] || 0;
      difficulty_pow = block.difficulty['proof-of-work'] || 0;
    } else {
      const diff = typeof block.difficulty === 'number' ? block.difficulty : parseFloat(block.difficulty || '0');
      difficulty_pos = block_type === 'pos' ? diff : 0;
      difficulty_pow = block_type !== 'pos' ? diff : 0;
    }
  }

  await db.run('BEGIN TRANSACTION');
  try {
    await db.run(`
      INSERT INTO blocks (height, hash, previous_hash, time, mediantime, size, difficulty_pos, difficulty_pow, tx_count, block_type, reward, subsidy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      height,
      block.hash,
      block.previousblockhash || null,
      block.time,
      block.mediantime || block.time,
      block.size,
      difficulty_pos,
      difficulty_pow,
      block.tx.length,
      block_type,
      blockRewardSatoshis,
      blockSubsidySatoshis
    );

    let transferVolumeAmount = 0;
    let userTxCount = 0;
    let hasRewardTx = false;

    // Process transactions
    for (const tx of block.tx) {
      const txid = tx.txid;
      const tx_type = classifyTransaction(tx, height, block_type);

      // Maps to accumulate amounts per address to handle multiple inputs/outputs cleanly
      const addressSent = new Map<string, number>();
      const addressReceived = new Map<string, number>();
      const txAddresses = new Set<string>();

      // Sum outputs
      let outputs_sum = 0;
      for (const out of tx.vout) {
        outputs_sum += toSatoshis(out.value);
      }

      // Sum inputs
      let inputs_sum = 0;
      const spentInputs: Array<{ address: string; amount: number; txid: string; vout: number; block_height: number }> = [];

      if (!isCoinBase(tx)) {
        for (const input of tx.vin) {
          const prevout = await db.get('SELECT address, amount, block_height FROM utxos WHERE txid = ? AND vout_index = ?', input.txid, input.vout) as { address: string; amount: number; block_height: number } | undefined;
          if (prevout) {
            inputs_sum += prevout.amount;
            spentInputs.push({
              address: prevout.address,
              amount: prevout.amount,
              txid: input.txid,
              vout: input.vout,
              block_height: prevout.block_height,
            });
            addressSent.set(prevout.address, (addressSent.get(prevout.address) || 0) + prevout.amount);
            txAddresses.add(prevout.address);
          }
        }
      }

      const fee = isCoinBase(tx) || isCoinStake(tx) ? 0 : Math.max(0, inputs_sum - outputs_sum);
      const amount = tx_type === 'stake_reward' ? (blockRewardSatoshis || 0) : outputs_sum;

      if (tx_type === 'normal_transfer') {
        transferVolumeAmount += outputs_sum;
        userTxCount += 1;
      }
      if (isRewardTransactionType(tx_type)) {
        hasRewardTx = true;
      }

      await db.run(`
        INSERT INTO transactions (txid, block_hash, block_height, time, type, amount, fee, confirmations)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        txid,
        block.hash,
        height,
        block.time,
        tx_type,
        amount,
        fee,
        block.confirmations || 1
      );

      // 1. Save spent UTXO records and delete them
      for (const spent of spentInputs) {
        await db.run(`
          INSERT INTO spent_utxos (spending_txid, spending_block_height, prev_txid, prev_vout_index, prev_block_height, address, amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, txid, height, spent.txid, spent.vout, spent.block_height, spent.address, spent.amount);
        await db.run('DELETE FROM utxos WHERE txid = ? AND vout_index = ?', spent.txid, spent.vout);
      }

      // 2. Process output UTXO creations
      for (let i = 0; i < tx.vout.length; i++) {
        const out = tx.vout[i];
        const valSat = toSatoshis(out.value);
        if (valSat === 0) continue; // Skip zero-value outputs

        let address: string | null = null;
        if (out.scriptPubKey) {
          if (out.scriptPubKey.address) {
            address = out.scriptPubKey.address;
          } else if (Array.isArray(out.scriptPubKey.addresses) && out.scriptPubKey.addresses.length > 0) {
            address = out.scriptPubKey.addresses[0];
          }
        }

        if (address) {
          await db.run(`
            INSERT INTO utxos (txid, vout_index, address, amount, block_height)
            VALUES (?, ?, ?, ?, ?)
          `, txid, i, address, valSat, height);

          addressReceived.set(address, (addressReceived.get(address) || 0) + valSat);
          txAddresses.add(address);
        }
      }

      for (const addr of txAddresses) {
        await db.run(`
          INSERT OR IGNORE INTO addresses (address, balance, received, sent, tx_count)
          VALUES (?, 0, 0, 0, 0)
        `, addr);
      }

      // 3. Write aggregated address transactions to database
      for (const [addr, sentAmt] of addressSent.entries()) {
        await db.run(`
          INSERT INTO address_transactions (address, txid, block_height, amount, type)
          VALUES (?, ?, ?, ?, 'sent')
        `, addr, txid, height, -sentAmt);
      }

      for (const [addr, recAmt] of addressReceived.entries()) {
        await db.run(`
          INSERT INTO address_transactions (address, txid, block_height, amount, type)
          VALUES (?, ?, ?, ?, 'received')
        `, addr, txid, height, recAmt);
      }

      // 4. Update address balances once per address per transaction
      for (const addr of txAddresses) {
        const sentAmt = addressSent.get(addr) || 0;
        const recAmt = addressReceived.get(addr) || 0;

        const addrRow = await db.get('SELECT balance, received, sent, tx_count FROM addresses WHERE address = ?', addr) as { balance: number; received: number; sent: number; tx_count: number } | undefined;

        const newBal = (addrRow?.balance || 0) - sentAmt + recAmt;
        const newRec = (addrRow?.received || 0) + recAmt;
        const newSent = (addrRow?.sent || 0) + sentAmt;
        const newTxCount = (addrRow?.tx_count || 0) + 1;

        await db.run(`
          UPDATE addresses
          SET balance = ?, received = ?, sent = ?, tx_count = ?
          WHERE address = ?
        `, newBal, newRec, newSent, newTxCount, addr);
      }
    }

    const amountFields = computeBlockAmountFields({
      reward_amount: blockRewardSatoshis,
      transfer_volume_amount: transferVolumeAmount,
      user_tx_count: userTxCount,
      has_reward_tx: hasRewardTx,
    });

    await db.run(`
      UPDATE blocks
      SET transfer_volume_amount = ?,
          user_tx_count = ?,
          primary_amount = ?,
          primary_amount_kind = ?,
          primary_amount_label = ?,
          amount_badge = ?
      WHERE height = ?
    `,
      amountFields.transfer_volume_amount,
      amountFields.user_tx_count,
      amountFields.primary_amount,
      amountFields.primary_amount_kind,
      amountFields.primary_amount_label,
      amountFields.amount_badge,
      height,
    );

    // Save height state
    await setIndexerHeight(height);
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runIndexer(): Promise<void> {
  const pollIntervalMs = parseInt(process.env.INDEXER_POLL_INTERVAL_MS || '10000', 10);

  console.log(`Starting Quavence Indexer... pollInterval=${pollIntervalMs}ms`);
  await initDb();
  while (true) {
    try {
      let lastIndexed = await getIndexerHeight();
      const info = await getBlockchainInfo();
      const networkHeight = info.blocks;

      if (lastIndexed < networkHeight) {
        const start = lastIndexed + 1;
        console.log(`Syncing blocks from height ${start} to ${networkHeight}...`);

        for (let h = start; h <= networkHeight; h++) {
          const hash = await getBlockHash(h);
          const block = await getBlock(hash);

          // Check for reorg
          if (h > 0) {
            const dbBlock = await getBlockByHeight(h - 1);
            if (dbBlock && dbBlock.hash !== block.previousblockhash) {
              const rollbackFromHeight = h - 1;
              console.warn(`Reorg detected at height ${h}! DB previous block hash: ${dbBlock.hash}, Node block previous hash: ${block.previousblockhash}. Rolling back from height ${rollbackFromHeight}...`);
              await rollbackToHeight(rollbackFromHeight);
              lastIndexed = rollbackFromHeight - 1;
              break;
            }
          }

          await saveBlockToDb(block, h);
          if (h % 50 === 0 || h === networkHeight) {
            console.log(`Indexed block ${h}/${networkHeight} [${block.hash}]`);
          }
        }
      } else {
        await sleep(pollIntervalMs);
      }
    } catch (error: any) {
      console.error('Indexer sync error:', error.message || error);
      await sleep(pollIntervalMs * 2);
    }
  }
}

// Run directly if invoked
if (process.argv[1] && (process.argv[1].endsWith('indexer.ts') || process.argv[1].endsWith('indexer.js'))) {
  runIndexer().catch((err) => {
    console.error('Fatal indexer crash:', err);
    process.exit(1);
  });
}
