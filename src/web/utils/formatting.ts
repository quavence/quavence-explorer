export const formatQVNC = (satoshis: number | null | undefined): string => {
  if (satoshis === null || satoshis === undefined) return 'Pending / Prevout unavailable';
  const val = (satoshis / 100000000).toFixed(8);
  const parts = val.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join('.') + ' QVNC';
};

export const formatNetworkWeight = (val: number | null | undefined): string => {
  if (val === null || val === undefined || val === 0) return 'unavailable';
  const parts = val.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join('.') + ' QVNC';
};

export const formatTime = (timestamp: number | string | null | undefined): string => {
  if (!timestamp) return '-';
  let d: Date;
  if (typeof timestamp === 'number') {
    d = new Date(timestamp < 100000000000 ? timestamp * 1000 : timestamp);
  } else {
    const parsedNum = Number(timestamp);
    if (!isNaN(parsedNum)) {
      d = new Date(parsedNum < 100000000000 ? parsedNum * 1000 : parsedNum);
    } else {
      d = new Date(timestamp.includes('Z') ? timestamp : timestamp.replace(' ', 'T') + 'Z');
      if (isNaN(d.getTime())) {
        d = new Date(timestamp);
      }
    }
  }
  if (isNaN(d.getTime())) return String(timestamp);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d) + ' UTC';
};

export const shortenHash = (hash: string | null | undefined): string => {
  if (!hash) return '';
  return hash.substring(0, 8) + '...' + hash.substring(hash.length - 8);
};

export const formatDifficulty = (val: any): string => {
  if (typeof val === 'number') return val.toFixed(6);
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? '0.000000' : parsed.toFixed(6);
  }
  if (val && typeof val === 'object') {
    const pos = val['proof-of-stake'] ?? val['proof-of-work'] ?? 0;
    return typeof pos === 'number' ? pos.toFixed(6) : parseFloat(pos || '0').toFixed(6);
  }
  return '0.000000';
};
