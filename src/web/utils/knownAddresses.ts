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
};

export function getKnownAddressTag(address: string): KnownAddressTag | null {
  if (!address) return null;
  return KNOWN_ADDRESSES[address] || null;
}
