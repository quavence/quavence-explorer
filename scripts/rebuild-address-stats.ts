import { initDb, rebuildAddressBalances } from '../src/db/db.js';

async function main() {
  console.log('================================================================');
  console.log('=== QUAVENCE EXPLORER: REBUILD ADDRESS STATS & POS NET STAKE ===');
  console.log('================================================================\n');

  console.log('[Rebuild] Initializing database...');
  await initDb();

  console.log('[Rebuild] Recalculating addresses table with PoS net staking accounting...');
  const start = Date.now();
  await rebuildAddressBalances();
  const elapsed = Date.now() - start;

  console.log(`[Rebuild] Address statistics recalculation completed successfully in ${elapsed}ms.`);
}

main().catch((err) => {
  console.error('[Rebuild] Fatal error during address rebuild:', err);
  process.exit(1);
});
