import crypto from 'crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ALPHABET_MAP = new Map<string, number>();
for (let i = 0; i < ALPHABET.length; i++) {
  ALPHABET_MAP.set(ALPHABET[i], i);
}

/**
 * Decodes a Base58 string to a Buffer
 */
export function decodeBase58(str: string): Buffer | null {
  if (str.length === 0) return null;

  // Count leading zeroes (encoded as '1' in base58)
  let leadingZeros = 0;
  while (leadingZeros < str.length && str[leadingZeros] === '1') {
    leadingZeros++;
  }

  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const value = ALPHABET_MAP.get(char);
    if (value === undefined) return null; // Invalid character

    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Allocate result buffer
  const result = Buffer.alloc(leadingZeros + bytes.length);
  for (let i = 0; i < leadingZeros; i++) {
    result[i] = 0;
  }
  for (let i = 0; i < bytes.length; i++) {
    result[leadingZeros + i] = bytes[bytes.length - 1 - i];
  }

  return result;
}

/**
 * Validates a Base58Check string against expected version bytes
 */
export function validateBase58Check(str: string, expectedVersions: number[]): boolean {
  const decoded = decodeBase58(str);
  if (!decoded || decoded.length < 5) return false;

  const version = decoded[0];
  if (!expectedVersions.includes(version)) return false;

  const payload = decoded.subarray(0, decoded.length - 4);
  const checksum = decoded.subarray(decoded.length - 4);

  // Double SHA-256
  const hash1 = crypto.createHash('sha256').update(payload).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();

  // Verify first 4 bytes of hash2 match the checksum
  for (let i = 0; i < 4; i++) {
    if (hash2[i] !== checksum[i]) return false;
  }

  return true;
}

/**
 * Validates if the string is a valid Quavence public address (S... or s...)
 */
export function isValidQuavenceAddress(str: string): boolean {
  // Broad shape check to avoid unnecessary big integer decodes on random junk
  if (!/^[1-9A-HJ-NP-Za-km-z]{25,45}$/.test(str)) {
    return false;
  }
  return validateBase58Check(str, [63, 125]);
}

/**
 * Validates if the string is a Quavence private key (7...)
 */
export function isQuavencePrivateKey(str: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{40,55}$/.test(str)) {
    return false;
  }
  return validateBase58Check(str, [193]);
}
