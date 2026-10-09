import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in voor de twee tabellen die de resetflow raakt.
type TokenRow = { id: string; userId: string; type: string; tokenHash: string; expiresAt: Date; usedAt: Date | null };
type UserRow = { id: string; email: string; locale: string; passwordHash: string; emailVerifiedAt: Date | null };
const state = vi.hoisted(() => ({ tokens: [] as TokenRow[], users: [] as UserRow[], seq: 0 }));

function matches(row: TokenRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    const cur = (row as Record<string, unknown>)[k];
    if (v && typeof v === "object" && "gt" in v) return (cur as Date) > (v as { gt: Date }).gt;
    return cur === v;
  });
}

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    authToken: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<TokenRow> }) => {
        const hit = state.tokens.filter((t) => matches(t, where));
        hit.forEach((t) => Object.assign(t, data));
        return { count: hit.length };
      },
      create: async ({ data }: { data: Omit<TokenRow, "id" | "usedAt"> }) => {
        const row = { id: `t${++state.seq}`, usedAt: null, ...data };
        state.tokens.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => state.tokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
    },
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        state.users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const u = state.users.find((x) => x.id === where.id);
        if (!u) throw new Error("not found");
        Object.assign(u, data);
        return u;
      },
    },
    auditLog: { create: () => Promise.resolve() },
  },
}));

const sent: { to: string; html: string }[] = [];
vi.mock("@/lib/email", () => ({
  emailConfigured: () => !!process.env.RESEND_API_KEY,
  sendEmail: async (input: { to: string; html: string }) => {
    sent.push(input);
  },
}));

import { consumeAuthToken, createAuthToken, hashToken, peekAuthToken, TOKEN_TTL_MS } from "@/lib/auth-tokens";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { GET as verifyEmail } from "@/app/api/auth/verify-email/route";

function post(url: string, body: unknown, ip: string) {
  return new Request(`https://saldova.test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.tokens.length = 0;
  state.users.length = 0;
  sent.length = 0;
  state.users.push({ id: "u1", email: "jan@example.nl", locale: "nl", passwordHash: "old", emailVerifiedAt: null });
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://saldova.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("one-time auth tokens", () => {
  it("stores only a hash and works exactly once", async () => {
    const token = await createAuthToken("u1", "PASSWORD_RESET");
    expect(state.tokens[0].tokenHash).toBe(hashToken(token));
    expect(state.tokens[0].tokenHash).not.toContain(token);
    expect(await peekAuthToken(token, "PASSWORD_RESET")).toBe("u1");
    expect(await consumeAuthToken(token, "PASSWORD_RESET")).toBe("u1");
    expect(await consumeAuthToken(token, "PASSWORD_RESET")).toBeNull();
  });

  it("rejects the wrong type, malformed values and expired links", async () => {
    const now = new Date(Date.UTC(2026, 9, 9));
    const token = await createAuthToken("u1", "PASSWORD_RESET", now);
    expect(await consumeAuthToken(token, "EMAIL_VERIFY", now)).toBeNull();
    for (const bad of ["", "short", token + "x", "../../etc"]) expect(await consumeAuthToken(bad, "PASSWORD_RESET", now)).toBeNull();
    const later = new Date(now.getTime() + TOKEN_TTL_MS.PASSWORD_RESET);
    expect(await peekAuthToken(token, "PASSWORD_RESET", later)).toBeNull();
    expect(await consumeAuthToken(token, "PASSWORD_RESET", later)).toBeNull();
  });

  it("a newer link invalidates the previous one", async () => {
    const first = await createAuthToken("u1", "PASSWORD_RESET");
    const second = await createAuthToken("u1", "PASSWORD_RESET");
    expect(await consumeAuthToken(first, "PASSWORD_RESET")).toBeNull();
    expect(await consumeAuthToken(second, "PASSWORD_RESET")).toBe("u1");
  });
});

describe("password reset flow", () => {
  it("answers identically for known and unknown addresses", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const known = await forgotPassword(post("/api/auth/forgot-password", { email: "Jan@Example.nl" }, "10.0.0.1"));
    const unknown = await forgotPassword(post("/api/auth/forgot-password", { email: "nobody@example.nl" }, "10.0.0.1"));
    expect(known.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("jan@example.nl");
    expect(sent[0].html).toContain("https://saldova.test/reset-password?token=");
  });

  it("reports when no email provider is configured and sends nothing", async () => {
    const res = await forgotPassword(post("/api/auth/forgot-password", { email: "jan@example.nl" }, "10.0.0.2"));
    expect(await res.json()).toEqual({ ok: true, emailConfigured: false });
    expect(state.tokens).toHaveLength(0);
  });

  it("sets a new password once, verifies the email and rejects reuse", async () => {
    const token = await createAuthToken("u1", "PASSWORD_RESET");
    const ok = await resetPassword(post("/api/auth/reset-password", { token, password: "nieuw-wachtwoord" }, "10.0.0.3"));
    expect(ok.status).toBe(200);
    expect(state.users[0].passwordHash).not.toBe("old");
    expect(state.users[0].emailVerifiedAt).toBeInstanceOf(Date);
    const again = await resetPassword(post("/api/auth/reset-password", { token, password: "nog-een-keer" }, "10.0.0.3"));
    expect(again.status).toBe(400);
  });

  it("rejects short passwords without using the link", async () => {
    const token = await createAuthToken("u1", "PASSWORD_RESET");
    const res = await resetPassword(post("/api/auth/reset-password", { token, password: "kort" }, "10.0.0.4"));
    expect(res.status).toBe(422);
    expect(await peekAuthToken(token, "PASSWORD_RESET")).toBe("u1");
  });
});

describe("email verification link", () => {
  it("confirms the address and redirects to the dashboard", async () => {
    const token = await createAuthToken("u1", "EMAIL_VERIFY");
    const res = await verifyEmail(new Request(`https://saldova.test/api/auth/verify-email?token=${token}`, { headers: { "x-forwarded-for": "10.0.0.5" } }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://saldova.test/dashboard?verified=1");
    expect(state.users[0].emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("sends invalid links back to login", async () => {
    const res = await verifyEmail(new Request("https://saldova.test/api/auth/verify-email?token=nope", { headers: { "x-forwarded-for": "10.0.0.6" } }));
    expect(res.headers.get("location")).toBe("https://saldova.test/login?verify=invalid");
  });
});
