import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./data/explorer.sqlite');

const addrs = [
  'SXbKabuHh7xn3QuXF7DMG758D9j4rVcL6V',
  'ScmZ5fYVTADyMcH11CXtf9iC9qVeRHA31M',
  'SXmpJDFVEW7HzwrAAVrpK8hTDzyjfdbpU6',
  'SPdSBBkFNKop3auzvFjGJpaCAdVnMQFyyd'
];

db.all(`
  SELECT address, balance / 1e8 as balance, received / 1e8 as received, sent / 1e8 as sent, tx_count
  FROM addresses
  WHERE address IN (${addrs.map(a => `'${a}'`).join(',')})
`, (err, rows) => {
  if (err) console.error(err);
  else {
    console.log('=== ADDRESS BALANCES & TOTALS ===');
    console.table(rows);
  }
});

db.all(`
  SELECT txid, block_height, amount_raw_output / 1e8 as raw_amount, time
  FROM transactions
  WHERE txid IN (
    SELECT txid FROM address_transactions WHERE address IN (${addrs.map(a => `'${a}'`).join(',')})
  )
  ORDER BY amount_raw_output DESC
  LIMIT 20
`, (err, rows) => {
  if (err) console.error(err);
  else {
    console.log('=== TOP TRANSACTIONS INVOLVING THESE ADDRESSES ===');
    console.table(rows);
  }
});
