import React from 'react';

export interface KnownAddressTag {
  label: string;
  badgeText: string;
  badgeStyle: React.CSSProperties;
  description: string;
}

const BASE_BADGE_STYLE: React.CSSProperties = {
  backgroundColor: '#1b222d',
  color: '#94a3b8',
  border: '1px solid #2e3846',
  padding: '1px 6px',
  borderRadius: '3px',
  fontSize: '0.68rem',
  fontWeight: 500,
  display: 'inline-block',
  marginLeft: '8px',
  verticalAlign: 'middle',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  letterSpacing: '0.02em',
};

const COLD_BADGE_STYLE: React.CSSProperties = {
  backgroundColor: '#0c2238',
  color: '#38bdf8',
  border: '1px solid #0284c7',
  padding: '1px 6px',
  borderRadius: '3px',
  fontSize: '0.68rem',
  fontWeight: 600,
  display: 'inline-block',
  marginLeft: '8px',
  verticalAlign: 'middle',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  letterSpacing: '0.02em',
};

export const KNOWN_ADDRESSES: Record<string, KnownAddressTag> = {
  // Official DAO Treasury & DevFee Fund (Hardcoded in chainparams.cpp)
  'SXbKabuHh7xn3QuXF7DMG758D9j4rVcL6V': {
    label: 'DAO Treasury',
    badgeText: 'DAO Treasury',
    badgeStyle: BASE_BADGE_STYLE,
    description: 'Official Quavence DAO Treasury & DevFee reserve',
  },

  // Genesis Premine Address (Block 0 allocation)
  'Sb9jz3wcMG2v92M4UqdVMxxT4v4XAs4Gjw': {
    label: 'Genesis Premine',
    badgeText: 'Genesis Premine',
    badgeStyle: BASE_BADGE_STYLE,
    description: 'Network Genesis (Block 0) 50,000 QVNC premine distribution address',
  },

  // PoUS AI Worker Pool Address (30% DevFee allocation)
  'ScmZ5fYVTADyMcH11CXtf9iC9qVeRHA31M': {
    label: 'AI Worker Pool',
    badgeText: 'AI Worker Pool',
    badgeStyle: BASE_BADGE_STYLE,
    description: 'PoUS AI Worker DevFee Pool (30% on-chain reward allocation for DePIN computing)',
  },

  // Cold Vault 1: AI Worker Reward Reserve (13,000 QVNC)
  'SP25CJVNG5CDrNhJqhzYqVmGYv24EJyqsQ': {
    label: 'Cold: Worker Rewards',
    badgeText: '🧊 Cold: Worker Reserve',
    badgeStyle: COLD_BADGE_STYLE,
    description: 'Cold storage vault: AI Worker task reward fund reserve (13,000 QVNC, staking=0)',
  },

  // Cold Vault 2: Team & Founder Reserve (12,500 QVNC, 18-month vesting)
  'Sa9YBWLrF6FjQwaXXcjpHyrGJ4YzLsiVX1': {
    label: 'Cold: Team Reserve',
    badgeText: '🧊 Cold: Team Reserve',
    badgeStyle: COLD_BADGE_STYLE,
    description: 'Cold storage vault: Team & Architect reserve (12,500 QVNC, 15% Genesis unlock + 18m vesting, staking=0)',
  },

  // Cold Vault 3: DAO Treasury Vault (9,500 QVNC)
  'SZjekg13eHqJKEcwt6P92A3XU8ETfZt8sP': {
    label: 'Cold: DAO Treasury',
    badgeText: '🧊 Cold: DAO Treasury',
    badgeStyle: COLD_BADGE_STYLE,
    description: 'Cold storage vault: Quavence DAO Treasury reserve body (9,500 QVNC, staking=0)',
  },

  // Cold Vault 4: Presale Allocation & Launch Distribution Basket (7,500 QVNC)
  'SXj6w7JWCXCF5JwERqYrY5xPLKrnp72tNk': {
    label: 'Cold: Presale Allocation',
    badgeText: '🧊 Cold: Presale Allocation',
    badgeStyle: COLD_BADGE_STYLE,
    description: 'Cold storage vault: Presale packages & ecosystem launch allocation (7,500 QVNC, staking=0)',
  },
  'SVW4ps8buTVcD3MtBZbXTZ1e3dwZMT6jgH': {
    label: 'Cold: Presale Allocation',
    badgeText: '🧊 Cold: Presale Allocation',
    badgeStyle: COLD_BADGE_STYLE,
    description: 'Cold storage vault: Presale packages & ecosystem launch allocation (7,500 QVNC, staking=0)',
  },

  // Cold Vault 5: Liquidity Operations (3,000 QVNC)
  'SiyCrHSwuFSuKTW6S5iDc6e11eEJocAvbQ': {
    label: 'Cold: Liquidity Ops',
    badgeText: '🧊 Cold: Liquidity Ops',
    badgeStyle: COLD_BADGE_STYLE,
    description: 'Cold storage vault: Operational liquidity, bridge, and infrastructure (3,000 QVNC, staking=0)',
  },

  // Cold Vault 6: Ecosystem Grants (2,000 QVNC)
  'SVU1wDNPJ6soi9eZCoyFBnkdWaZcWv5rcS': {
    label: 'Cold: Ecosystem Grants',
    badgeText: '🧊 Cold: Grants Fund',
    badgeStyle: COLD_BADGE_STYLE,
    description: 'Cold storage vault: Ecosystem developer grants & partner bounties (2,000 QVNC, staking=0)',
  },
};

export function getKnownAddressTag(address: string): KnownAddressTag | null {
  if (!address) return null;
  return KNOWN_ADDRESSES[address] || null;
}
