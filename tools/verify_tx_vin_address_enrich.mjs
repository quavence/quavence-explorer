import assert from 'node:assert/strict';
import {
  enrichRawTxWithContributorAddresses,
  uniqueContributorAddresses,
} from '../src/api/utils/txIo.ts';

const contributors = [
  {
    prev_txid: 'aaa',
    prev_vout_index: 0,
    address: 'SS2SenBzdPH2bDjdPsDJhshVKDgRB9XNFy',
    amount: 1,
  },
];

const raw = {
  txid: 'child',
  vin: [{ txid: 'aaa', vout: 0, scriptSig: { hex: '00' }, sequence: 1 }],
  vout: [],
};

const enriched = enrichRawTxWithContributorAddresses(raw, contributors);
assert.deepEqual(enriched.vin[0].addresses, ['SS2SenBzdPH2bDjdPsDJhshVKDgRB9XNFy']);
assert.deepEqual(enriched.vin[0].prevout.scriptPubKey.addresses, [
  'SS2SenBzdPH2bDjdPsDJhshVKDgRB9XNFy',
]);
assert.deepEqual(uniqueContributorAddresses(contributors), [
  'SS2SenBzdPH2bDjdPsDJhshVKDgRB9XNFy',
]);

console.log('verify_tx_vin_address_enrich: OK');
