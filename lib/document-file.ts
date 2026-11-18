export const MAX_DOCUMENT_BYTES = 2_000_000;
/** Validate bytes, not the extension supplied by a browser or email sender. */
export function documentMime(bytes: Uint8Array, maximumBytes = MAX_DOCUMENT_BYTES): string | null {
  if (!bytes.length || bytes.length > maximumBytes) return null;
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (starts(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(82, 73, 70, 70) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
  return null;
}
