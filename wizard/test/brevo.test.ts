import { afterEach, describe, expect, it, vi } from "vitest";
import { BrevoError, authenticate, createDomain, getDomain } from "../src/brevo";

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

function stubBrevo(handler: (call: Call) => { status: number; body?: unknown }): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      path: url.replace("https://api.brevo.com", ""),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const r = handler(call);
    return Promise.resolve(
      new Response(r.body === undefined ? null : JSON.stringify(r.body), {
        status: r.status,
      }),
    );
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

// The wire shape captured live 2026-08-11.
const WIRE = {
  domain: "p.example",
  verified: false,
  authenticated: false,
  dns_records: {
    dkim_record: null,
    dkim1Record: {
      type: "CNAME",
      value: "b1.p-example.dkim.brevo.com",
      host_name: "brevo1._domainkey",
      status: true,
    },
    dkim2Record: {
      type: "CNAME",
      value: "b2.p-example.dkim.brevo.com",
      host_name: "brevo2._domainkey",
      status: false,
    },
    brevo_code: {
      type: "TXT",
      value: "brevo-code:abc123",
      host_name: "@",
      status: false,
    },
    dmarc_record: {
      type: "TXT",
      value: "v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com",
      host_name: "_dmarc",
      status: true,
    },
  },
};

describe("getDomain", () => {
  it("maps the records in placement order, skipping absent variants", async () => {
    stubBrevo(() => ({ status: 200, body: WIRE }));
    const state = await getDomain("key", "p.example");
    expect(state.authenticated).toBe(false);
    expect(state.records.map((r) => r.label)).toEqual([
      "DKIM 1",
      "DKIM 2",
      "Brevo code",
      "DMARC",
    ]);
    expect(state.records[0]).toEqual({
      label: "DKIM 1",
      type: "CNAME",
      host: "brevo1._domainkey",
      value: "b1.p-example.dkim.brevo.com",
      status: true,
    });
  });
});

describe("createDomain", () => {
  it("POSTs the domain and maps the answer", async () => {
    const calls = stubBrevo(() => ({ status: 200, body: WIRE }));
    const state = await createDomain("key", "p.example");
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/v3/senders/domains",
      body: { name: "p.example" },
    });
    expect(state.records).toHaveLength(4);
  });

  it("reads an already-registered domain back instead", async () => {
    const calls = stubBrevo((c) =>
      c.method === "POST"
        ? {
            status: 404,
            body: { code: "duplicate_parameter", message: "Domain with same name already exists" },
          }
        : { status: 200, body: { ...WIRE, authenticated: true } },
    );
    const state = await createDomain("key", "p.example");
    expect(state.authenticated).toBe(true);
    expect(calls[1]).toMatchObject({ method: "GET", path: "/v3/senders/domains/p.example" });
  });

  it("surfaces other failures with Brevo's message", async () => {
    stubBrevo(() => ({ status: 401, body: { code: "unauthorized", message: "Key not found" } }));
    await expect(createDomain("bad", "p.example")).rejects.toMatchObject({
      status: 401,
      message: "Key not found",
    });
  });
});

describe("authenticate", () => {
  it("is true on success and false while Brevo cannot see the records", async () => {
    stubBrevo(() => ({ status: 200, body: { message: "authenticated" } }));
    expect(await authenticate("key", "p.example")).toBe(true);
    vi.unstubAllGlobals();
    stubBrevo(() => ({
      status: 400,
      body: { code: "bad_request", message: "The domain cannot be authenticated." },
    }));
    expect(await authenticate("key", "p.example")).toBe(false);
  });

  it("does not swallow authentication-unrelated failures", async () => {
    stubBrevo(() => ({ status: 429, body: { message: "Too many requests" } }));
    await expect(authenticate("key", "p.example")).rejects.toBeInstanceOf(BrevoError);
  });
});
