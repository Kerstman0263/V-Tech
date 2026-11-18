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

/** Toegestane bonnetjes/documenten als data-URL (geen SVG: dat kan script bevatten). */
export const DOCUMENT_DATA_URL = /^data:(image\/png|image\/jpeg|image\/webp|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Maximale lengte van zo'n data-URL voor MAX_DOCUMENT_BYTES (base64 = 4/3 + voorvoegsel). */
export const MAX_DOCUMENT_DATA_URL_LENGTH = Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 + 40;

/**
 * Decodeert een data-URL op de server en controleert de echte bytes. Alleen
 * PNG, JPEG, WebP of PDF tot 2 MB, en het opgegeven type moet kloppen met de
 * inhoud. Geeft een nette data-URL met het echte type terug, of null.
 */
export function verifiedDocumentDataUrl(dataUrl: string, maximumBytes = MAX_DOCUMENT_BYTES): string | null {
  if (dataUrl.length > Math.ceil(maximumBytes / 3) * 4 + 60) return null;
  const match = DOCUMENT_DATA_URL.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  const mime = documentMime(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), maximumBytes);
  if (!mime || mime !== match[1]) return null;
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
