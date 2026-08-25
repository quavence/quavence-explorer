import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./data/explorer.sqlite');

console.log('=== SEARCHING FOR 10000 QVNC TRANSACTIONS ACROSS THE ENTIRE EXPLORER DB ===');

// Check all transactions > 100 QVNC
db.all('SELECT txid, block_height, amount_raw_output / 100000000.0 as amount_qvnc, time FROM transactions WHERE amount_raw_output >= 10000000000 ORDER BY amount_raw_output DESC', (err, rows) => {
  if (err) console.error('Tx query error:', err);
  else {
    console.log(`Found ${rows.length} transactions >= 100 QVNC:`);
    console.table(rows);
  }
});

// Check all address balances in the explorer
db.all('SELECT address, balance / 100000000.0 as balance, received / 100000000.0 as received, sent / 100000000.0 as sent, tx_count FROM addresses WHERE received >= 10000000000 ORDER BY received DESC LIMIT 20', (err, rows) => {
  if (err) console.error('Address query error:', err);
  else {
    console.log('Top addresses by received amount in explorer:');
    console.table(rows);
  }
});
