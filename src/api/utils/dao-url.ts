/**
 * Resolves DAO API candidate endpoints securely without exposing
 * internal RFC-1918 addresses or localhost probes in production.
 */
export function getDaoCandidateUrls(): string[] {
  if (process.env.DAO_API_URL) {
    const val = process.env.DAO_API_URL.trim();
    if (val === 'none' || val === 'disabled' || val === 'off' || val === '') {
      return [];
    }
    return [val];
  }
  if (process.env.NODE_ENV === 'test') {
    return [];
  }
  // In production, strictly use canonical domain. Never probe localhost.
  if (process.env.NODE_ENV === 'production') {
    return ['https://quavence.com'];
  }
  // Development local fallback
  return ['http://127.0.0.1:3002', 'https://quavence.com'];
}
