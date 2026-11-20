import { documentMime } from "@/lib/document-file";

/** Oude bonnetjes kunnen iets groter zijn dan de huidige uploadgrens van 2 MB. */
const MAX_STORED_RECEIPT_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export interface ReceiptFile {
  bytes: Buffer;
  /** Echt type, bepaald uit de bytes (niet uit de data-URL). */
  mime: string;
  extension: string;
  /** Alleen foto's mogen inline (voorvertoning); een pdf gaat als download. */
  inline: boolean;
}

/**
 * Een opgeslagen bonnetje (base64 data-URL) als bestand. Het type komt uit de
 * bytes; onbekende inhoud gaat als application/octet-stream en nooit inline.
 * Geeft null bij een lege of kapotte data-URL.
 */
export function receiptFileFromDataUrl(dataUrl: string): ReceiptFile | null {
  const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  if (!bytes.length || bytes.length > MAX_STORED_RECEIPT_BYTES) return null;
  const mime = documentMime(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), MAX_STORED_RECEIPT_BYTES) ?? "application/octet-stream";
  return { bytes, mime, extension: EXTENSIONS[mime] ?? "bin", inline: mime.startsWith("image/") };
}
