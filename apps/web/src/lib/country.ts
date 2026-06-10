/**
 * Convert hex bytes2 country code to ISO letters.
 * e.g., "0x5553" → "US"; "0x0000" or malformed → undefined.
 *
 * Validates strict hex format AND the ASCII letter range (A-Z) to avoid
 * NaN / garbage characters.
 */
export function parseCountryCode(code?: string): string | undefined {
  if (!code) return undefined;

  // Normalize to 0x prefix
  const normalized = code.startsWith("0x") ? code : `0x${code}`;

  // Must be exactly 0x + 4 hex chars, and not 0x0000 (no country disclosed)
  if (!/^0x[0-9a-fA-F]{4}$/.test(normalized) || normalized === "0x0000") {
    return undefined;
  }

  const hex = normalized.slice(2);
  const byte1 = parseInt(hex.slice(0, 2), 16);
  const byte2 = parseInt(hex.slice(2, 4), 16);

  // Validate ASCII letter range (A-Z = 65-90)
  if (byte1 < 65 || byte1 > 90 || byte2 < 65 || byte2 > 90) {
    return undefined;
  }

  return String.fromCharCode(byte1, byte2);
}

/** Two-letter ISO country code → regional indicator emoji flag. */
export function countryToFlag(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
