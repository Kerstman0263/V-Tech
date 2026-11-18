import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";

// Geen netwerk: Shield en de next-intl-middleware worden nagebootst.
const { handle, createShield } = vi.hoisted(() => {
  const handle = vi.fn();
  const createShield = vi.fn(() => ({ handle, flush: vi.fn() }));
  return { handle, createShield };
});
vi.mock("../lib/wardova-shield", () => ({ createShield }));
vi.mock("../i18n/routing", () => ({ routing: {} }));
vi.mock("next-intl/middleware", () => ({
  default: () => () => new Response("locale", { status: 200, headers: { "x-test": "locale" } }),
}));

const VALID_KEY = `wsk_${"a".repeat(48)}`;

function event(): NextFetchEvent {
  return { waitUntil: vi.fn() } as unknown as NextFetchEvent;
}

async function loadMiddleware(key: string | undefined) {
  vi.resetModules();
  if (key === undefined) vi.stubEnv("WARDOVA_SHIELD_KEY", "");
  else vi.stubEnv("WARDOVA_SHIELD_KEY", key);
  return (await import("../middleware")).default;
}

beforeEach(() => {
  handle.mockReset();
  createShield.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("middleware zonder WARDOVA_SHIELD_KEY", () => {
  it("maakt geen Shield aan en roept hem niet aan", async () => {
    const middleware = await loadMiddleware(undefined);
    const response = await middleware(new NextRequest("https://saldova.test/facturen"), event());
    expect(createShield).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
    expect(response.headers.get("x-test")).toBe("locale");
  });

  it("de API-bescherming werkt zoals altijd", async () => {
    const middleware = await loadMiddleware(undefined);
    const crossSite = new NextRequest("https://saldova.test/api/invoices", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect((await middleware(crossSite, event())).status).toBe(403);
    const sameSite = new NextRequest("https://saldova.test/api/invoices", {
      method: "POST",
      headers: { origin: "https://saldova.test" },
    });
    const ok = await middleware(sameSite, event());
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("middleware met WARDOVA_SHIELD_KEY", () => {
  it("vraagt Shield eerst en geeft waitUntil door", async () => {
    handle.mockResolvedValue(null);
    const middleware = await loadMiddleware(VALID_KEY);
    const fetchEvent = event();
    const response = await middleware(new NextRequest("https://saldova.test/facturen"), fetchEvent);
    expect(createShield).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledTimes(1);
    const context = handle.mock.calls[0][1] as { waitUntil: (promise: Promise<unknown>) => void };
    context.waitUntil(Promise.resolve());
    expect(fetchEvent.waitUntil).toHaveBeenCalledTimes(1);
    expect(response.headers.get("x-test")).toBe("locale");
  });

  it("zet Shield altijd in de Monitor-stand", async () => {
    handle.mockResolvedValue(null);
    const middleware = await loadMiddleware(VALID_KEY);
    await middleware(new NextRequest("https://saldova.test/facturen"), event());
    expect(createShield).toHaveBeenCalledWith(expect.objectContaining({ monitorOnly: true }));
  });

  it("laat webhooks en de cron buiten Shield om", async () => {
    handle.mockResolvedValue(new Response("geblokkeerd", { status: 403 }));
    const middleware = await loadMiddleware(VALID_KEY);
    for (const path of ["/api/webhooks/mollie", "/api/inbound/email", "/api/cron/send-reminders"]) {
      const response = await middleware(new NextRequest(`https://saldova.test${path}`, { method: "POST" }), event());
      expect(response.status).toBe(200);
    }
    expect(handle).not.toHaveBeenCalled();
  });

  it("geeft het antwoord van Shield terug als Shield tegenhoudt", async () => {
    handle.mockResolvedValue(new Response("geblokkeerd", { status: 403, headers: { "x-wardova-shield": "1" } }));
    const middleware = await loadMiddleware(VALID_KEY);
    const response = await middleware(new NextRequest("https://saldova.test/facturen"), event());
    expect(response.status).toBe(403);
    expect(response.headers.get("x-wardova-shield")).toBe("1");
  });

  it("een fout in Shield legt Saldova niet plat", async () => {
    handle.mockRejectedValue(new Error("stuk"));
    const middleware = await loadMiddleware(VALID_KEY);
    const response = await middleware(new NextRequest("https://saldova.test/facturen"), event());
    expect(response.headers.get("x-test")).toBe("locale");
  });

  it("een trage Shield legt Saldova niet plat", async () => {
    vi.useFakeTimers();
    handle.mockReturnValue(new Promise(() => {}));
    const middleware = await loadMiddleware(VALID_KEY);
    const pending = middleware(new NextRequest("https://saldova.test/facturen"), event());
    await vi.advanceTimersByTimeAsync(2_500);
    const response = await pending;
    expect(response.headers.get("x-test")).toBe("locale");
  });

  it("een ongeldige sleutel zet Shield uit in plaats van te crashen", async () => {
    createShield.mockImplementationOnce(() => {
      throw new Error("ongeldige siteKey");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const middleware = await loadMiddleware("niet-goed");
    const response = await middleware(new NextRequest("https://saldova.test/facturen"), event());
    expect(handle).not.toHaveBeenCalled();
    expect(response.headers.get("x-test")).toBe("locale");
    expect(error.mock.calls.flat().join(" ")).not.toContain("niet-goed");
    error.mockRestore();
  });
});
