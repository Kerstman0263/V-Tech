import { afterEach, describe, it, expect, vi } from "vitest";
import { createShield } from "@/lib/wardova-shield";

// Geen netwerk: fetch wordt nagebootst.
const KEY = `wsk_${"b".repeat(48)}`;

function probe(): Request {
  return new Request("https://saldova.test/.env", {
    headers: { "x-real-ip": "203.0.113.7", "user-agent": "sqlmap/1.7" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Wardova Shield in de Monitor-stand", () => {
  it("blokkeert niets, ook niet een duidelijke aanval", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ mode: "monitor", rateLimitPerMinute: 120, blockBadBots: true, blockProbes: true, rules: [] })),
    );
    const shield = createShield({ siteKey: KEY });
    expect(await shield.handle(probe())).toBeNull();
  });

  it("valt terug op Monitor als Wardova onbereikbaar is", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const shield = createShield({ siteKey: KEY });
    expect(await shield.handle(probe())).toBeNull();
  });

  it("monitorOnly blokkeert niets, ook niet als Wardova op fortress staat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ mode: "fortress", rateLimitPerMinute: 120, blockBadBots: true, blockProbes: true, rules: [] })),
    );
    const shield = createShield({ siteKey: KEY, monitorOnly: true });
    // Eerste aanvraag (nog zonder configuratie) en een latere, met de fortress-configuratie geladen.
    expect(await shield.handle(probe())).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await shield.handle(probe())).toBeNull();
    const api = new Request("https://saldova.test/api/invoices", { method: "POST", headers: { "x-real-ip": "203.0.113.8" } });
    expect(await shield.handle(api)).toBeNull();
  });

  it("zonder monitorOnly houdt fortress een API-verzoek wel tegen (ter vergelijking)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ mode: "fortress", rateLimitPerMinute: 120, blockBadBots: true, blockProbes: true, rules: [] })),
    );
    const shield = createShield({ siteKey: KEY });
    const api = new Request("https://saldova.test/api/invoices", { method: "POST", headers: { "x-real-ip": "203.0.113.8" } });
    expect((await shield.handle(api))?.status).toBe(403);
  });

  it("weigert een sleutel met de verkeerde vorm", () => {
    expect(() => createShield({ siteKey: "geheim" })).toThrow();
  });
});
