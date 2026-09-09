import net from 'net';

export function normalizeHost(host: string): string {
  if (host.toLowerCase().startsWith('::ffff:')) {
    return host.substring(7);
  }
  return host;
}

export function isPrivateOrLocalIP(ip: string): boolean {
  const normalized = normalizeHost(ip);
  const lower = normalized.toLowerCase().trim();

  if (lower === 'localhost' || lower === '::1') return true;
  if (lower.endsWith('.onion')) return false;

  const ipType = net.isIP(lower);
  if (ipType === 0) return true;

  if (ipType === 4) {
    if (lower.startsWith('0.')) return true;
    if (lower.startsWith('127.')) return true;
    if (lower.startsWith('10.')) return true;
    if (lower.startsWith('192.168.')) return true;
    if (lower.startsWith('169.254.')) return true;
    const parts = lower.split('.');
    if (parts.length === 4) {
      const second = parseInt(parts[1], 10);
      if (!isNaN(second) && parts[0] === '172' && second >= 16 && second <= 31) return true;
    }
    return false;
  }

  if (ipType === 6) {
    if (lower === '::1') return true;

    const firstSegment = lower.split(':')[0];
    const firstWord = parseInt(firstSegment || '0', 16);
    if (!isNaN(firstWord)) {
      // fc00::/7 unique local and fe80::/10 link local.
      if ((firstWord & 0xfe00) === 0xfc00) return true;
      if ((firstWord & 0xffc0) === 0xfe80) return true;
    }

    return false;
  }

  return true;
}
