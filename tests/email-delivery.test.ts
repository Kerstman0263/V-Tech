import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email";

const fetchMock = vi.fn();
const input = { to: "customer@example.test", subject: "Factuur", html: '<p>Bekijk <a href="https://example.test/invoice">je factuur</a>.</p>', required: true };
beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "test-only"); vi.stubEnv("NODE_ENV", "test");
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("financial email delivery", () => {
  it("does not report success when delivery is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendEmail(input)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([400, 403, 429, 500])("reports provider failure %s without logging customer data", async (status) => {
    fetchMock.mockResolvedValue(new Response('private provider response', { status }));
    await expect(sendEmail(input)).rejects.toMatchObject({ status: 503 });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(input.to);
  });
  it("reports a connection failure", async () => {
    fetchMock.mockRejectedValue(new Error("private server details"));
    await expect(sendEmail(input)).rejects.toMatchObject({ status: 503 });
  });
  it("sends a plain-text version and reuses the provider key on retry", async () => {
    fetchMock.mockResolvedValue(new Response('{"id":"email-1"}', { status: 200 }));
    await sendEmail(input); await sendEmail(input);
    const first = fetchMock.mock.calls[0][1];
    expect(JSON.parse(first.body).text).toContain("https://example.test/invoice");
    expect(JSON.parse(first.body).text).not.toContain("<p>");
    expect(first.headers["Idempotency-Key"]).toBe(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]);
  });
});
