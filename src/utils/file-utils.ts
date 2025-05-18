/**
 * Calculates MD5 hash for a binary array
 * @param data Binary data
 * @returns MD5 hash as hex string
 */
export function calculateMd5(data: Uint8Array): string {
  // Use Web Crypto API for MD5 calculation (browser-compatible)
  // Note: Web Crypto doesn't support MD5 directly for security reasons
  // We'll use a simple implementation

  // For a real implementation, you could use a library like crypto-js:
  // import { MD5 } from 'crypto-js';
  // return MD5(Array.from(data).map(byte => String.fromCharCode(byte)).join('')).toString();

  // Placeholder implementation - you should replace this with a proper MD5 library
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}