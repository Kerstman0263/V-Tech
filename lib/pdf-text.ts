/**
 * Tekst klaarmaken voor de factuur-PDF.
 *
 * De PDF gebruikt de ingebouwde Helvetica (WinAnsi). Die kent de gewone
 * Nederlandse en West-Europese tekens (é, ü, ß, ø, €, Š, Ž, Œ), maar niet
 * bijvoorbeeld ł, ő, ş of emoji. pdf-lib gooit dan een fout en de hele PDF
 * mislukt. Daarom gaat alle tekst eerst door `pdfSafeText`: tekens die het
 * lettertype niet kent, worden vervangen door de letter zonder accent
 * (ő -> o, ş -> s, ł -> l) of, als dat niet kan, door een vraagteken.
 * De PDF crasht zo nooit op invoer van een gebruiker of klant.
 */

/** Wat de tekstfuncties van het lettertype nodig hebben (pdf-lib PDFFont). */
export interface PdfMeasureFont {
  widthOfTextAtSize(text: string, size: number): number;
  getCharacterSet(): number[];
}

// Letters die Unicode niet in "letter + accent" opsplitst, met de gangbare
// vervanging zonder accent.
const FALLBACK: Record<string, string> = {
  "\u0142": "l", "\u0141": "L", "\u0111": "d", "\u0110": "D", "\u00f0": "d", "\u0131": "i", "\u0130": "I",
  "\u0127": "h", "\u0126": "H", "\u0167": "t", "\u0166": "T", "\u014b": "n", "\u014a": "N", "\u0138": "k",
  "\u0140": "l", "\u013f": "L", "\u017f": "s", "\u0192": "f", "\u0250": "a", "\u0259": "e", "\u018f": "E",
  "\u0133": "ij", "\u0132": "IJ", "\u0149": "'n",
  // Leestekens en spaties die buiten WinAnsi vallen.
  "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2015": "-", "\u2212": "-",
  "\u2032": "'", "\u2033": "\"", "\u2044": "/", "\u2116": "No.",
  "\u2190": "<-", "\u2192": "->", "\u2264": "<=", "\u2265": ">=", "\u2248": "~",
  "\u00a0": " ", "\u2002": " ", "\u2003": " ", "\u2007": " ", "\u2009": " ", "\u202f": " ", "\u205f": " ", "\u3000": " ",
};

// Onzichtbare tekens (zero-width, variatiekiezers, huidskleur-modifiers bij
// emoji) en losse accenttekens: weglaten.
// Altijd weg, vóór het opdelen in tekens (ze horen nooit bij een emoji).
const STRIP = /[\u00ad\u200b\u2060\ufeff]/g;
// Weg als ze binnen een teken staan dat verder wel kan (ZWJ, variatiekiezers, huidskleur, tags).
const INVISIBLE_CHAR = /^[\u200c\u200d\ufe00-\ufe0f\u{1f3fb}-\u{1f3ff}\u{e0020}-\u{e007f}]$/u;
const COMBINING = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g;
const COMBINING_CHAR = /^[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]$/;

// Splitst tekst in wat een lezer als één teken ziet (grapheme): een emoji met
// huidskleur, een gezin (met ZWJ) of een vlag is dan één stuk en wordt één "?".
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;
function graphemes(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : [...text];
}

const charsetCache = new WeakMap<object, Set<number>>();
function charset(font: PdfMeasureFont): Set<number> {
  let set = charsetCache.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charsetCache.set(font, set);
  }
  return set;
}

/**
 * Maakt één regel tekst veilig voor het lettertype. Regeleinden en tabs
 * worden spaties; gebruik `wrapPdfText` voor tekst met meerdere regels.
 * Een teken dat niet kan, wordt precies één "?": ook een samengestelde emoji
 * (gezin, vlag, duim met huidskleur).
 */
export function pdfSafeText(input: string | null | undefined, font: PdfMeasureFont): string {
  if (!input) return "";
  const known = charset(font);
  const fits = (s: string) => [...s].every((ch) => known.has(ch.codePointAt(0)!));
  let out = "";
  const text = String(input).normalize("NFC").replace(STRIP, "").replace(/[\t\r\n\f\v\u2028\u2029]+/g, " ");
  for (const cluster of graphemes(text)) {
    if (fits(cluster)) { out += cluster; continue; }
    let piece = "";
    let failed = false;
    for (const ch of cluster) {
      const converted = convertChar(ch, known, fits);
      if (converted === null) { failed = true; break; }
      piece += converted;
    }
    out += failed ? "?" : piece;
  }
  return out;
}

// Eén teken omzetten: het teken zelf, een vervanging zonder accent, "" (weglaten)
// of null als het lettertype er niets mee kan.
function convertChar(ch: string, known: Set<number>, fits: (s: string) => boolean): string | null {
  const code = ch.codePointAt(0)!;
  if (known.has(code)) return ch;
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return ""; // stuurtekens
  if (INVISIBLE_CHAR.test(ch) || COMBINING_CHAR.test(ch)) return "";
  const mapped = FALLBACK[ch];
  if (mapped !== undefined && fits(mapped)) return mapped;
  const base = ch.normalize("NFD").replace(COMBINING, "");
  if (base && base !== ch && fits(base)) return base;
  const baseMapped = [...base].map((c) => FALLBACK[c] ?? c).join("");
  if (baseMapped && baseMapped !== ch && fits(baseMapped)) return baseMapped;
  return null;
}

/** Breedte van (veilige) tekst; meet nooit tekst die het lettertype niet kent. */
export function pdfTextWidth(text: string, font: PdfMeasureFont, size: number): number {
  return font.widthOfTextAtSize(pdfSafeText(text, font), size);
}

/** Kapt tekst af op een breedte, met "..." erachter als hij te lang is. */
export function fitPdfText(input: string, font: PdfMeasureFont, size: number, maxWidth: number): string {
  const text = pdfSafeText(input, font);
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 0 && font.widthOfTextAtSize(`${chars.join("")}...`, size) > maxWidth) chars.pop();
  return `${chars.join("").trimEnd()}...`;
}

/**
 * Breekt tekst af over regels die binnen `maxWidth` passen. Bestaande
 * regeleinden blijven staan, lange woorden (bijv. een URL) worden in stukken
 * gezet. Niets wordt weggelaten: de hele tekst komt op de PDF.
 */
export function wrapPdfText(input: string | null | undefined, font: PdfMeasureFont, size: number, maxWidth: number): string[] {
  if (!input) return [];
  const width = (s: string) => font.widthOfTextAtSize(s, size);
  const lines: string[] = [];
  const paragraphs = String(input).replace(/\r\n?/g, "\n").split("\n");
  for (const paragraph of paragraphs) {
    const safe = pdfSafeText(paragraph, font).replace(/ {2,}/g, " ").trim();
    if (!safe) { lines.push(""); continue; }
    let line = "";
    for (const word of safe.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(candidate) <= maxWidth) { line = candidate; continue; }
      if (line) lines.push(line);
      if (width(word) <= maxWidth) { line = word; continue; }
      // Woord langer dan de kolom: per teken afbreken.
      let part = "";
      for (const ch of word) {
        if (part && width(part + ch) > maxWidth) { lines.push(part); part = ""; }
        part += ch;
      }
      line = part;
    }
    if (line) lines.push(line);
  }
  // Lege regels aan begin en eind weg, en nooit meer dan één lege regel achter elkaar.
  const compact = lines.filter((line, i) => line !== "" || (i > 0 && lines[i - 1] !== ""));
  while (compact.length && compact[0] === "") compact.shift();
  while (compact.length && compact[compact.length - 1] === "") compact.pop();
  return compact;
}

/**
 * Haalt vaste zinnen (zoals de KOR-vermelding of de creditverwijzing) uit de
 * vrije opmerkingen, omdat de PDF ze al als vast onderdeel toont. Zo staan ze
 * er niet twee keer.
 */
export function removeFixedSentences(notes: string | null | undefined, sentences: (string | null | undefined)[]): string | null {
  if (!notes) return notes ?? null;
  let out = notes;
  for (const sentence of sentences) {
    if (!sentence) continue;
    out = out.split(sentence).join("");
  }
  out = out.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return out || null;
}
