import { describe, it, expect } from "vitest";
import { documentMime, MAX_DOCUMENT_BYTES } from "../lib/document-file";
import { createExpenseSchema } from "../lib/validations/expense";

describe("document upload boundaries", () => {
  it("recognises supported file signatures", () => {
    expect(documentMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(documentMime(Uint8Array.from([137,80,78,71,13,10,26,10]))).toBe("image/png");
    expect(documentMime(Uint8Array.from([255,216,255]))).toBe("image/jpeg");
    expect(documentMime(new TextEncoder().encode("RIFF0000WEBP"))).toBe("image/webp");
  });
  it("rejects HTML, SVG and unknown or empty bytes", () => {
    for (const text of ["", "<html>PDF</html>", "<svg/>", "RIFF0000WAVE"]) expect(documentMime(new TextEncoder().encode(text))).toBeNull();
  });
  it("enforces upload size while allowing bounded legacy downloads", () => {
    const large = new Uint8Array(MAX_DOCUMENT_BYTES + 1); large.set([37,80,68,70,45]);
    expect(documentMime(large)).toBeNull();
    expect(documentMime(large, 5 * 1024 * 1024)).toBe("application/pdf");
  });
  it("rejects impossible calendar dates before processing an expense", () => {
    const expense = { vendor: "Supplier", amountGross: 121, vatRate: 21 };
    for (const date of ["2026-02-30", "2025-02-29", "2026-13-01", "1999-01-01"]) expect(createExpenseSchema.safeParse({ ...expense, date }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...expense, date: "2028-02-29" }).success).toBe(true);
  });
});
