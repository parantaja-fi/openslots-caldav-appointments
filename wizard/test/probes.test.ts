import { afterEach, describe, expect, it, vi } from "vitest";
import type { GithubCache } from "../src/probes";
import { probeDns, probeFork, probeHealth, probeRun } from "../src/probes";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("probeFork", () => {
  it("is present when the repository answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ name: "fork" })));
    expect(await probeFork("alice", "fork", {})).toEqual({ state: "present" });
  });

  it("is absent on 404 — a proven no, not blindness", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Not Found" }, 404)));
    expect(await probeFork("alice", "fork", {})).toEqual({ state: "absent" });
  });

  it("answers a 304 from the ETag cache without re-reading the body", async () => {
    const cache: GithubCache = {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ name: "fork" }, 200, { etag: 'W/"abc"' }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeFork("alice", "fork", cache)).toEqual({ state: "present" });
    expect(await probeFork("alice", "fork", cache)).toEqual({ state: "present" });
    const second = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(new Headers(second.headers).get("if-none-match")).toBe('W/"abc"');
  });

  it("keeps the last answer when rate-limited", async () => {
    const cache: GithubCache = {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ name: "fork" }, 200, { etag: 'W/"abc"' }))
      .mockResolvedValueOnce(json({ message: "rate limited" }, 403));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeFork("alice", "fork", cache)).toEqual({ state: "present" });
    expect(await probeFork("alice", "fork", cache)).toEqual({ state: "present" });
  });

  it("is blind, naming the reset time, when rate-limited with a cold cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ message: "rate limited" }, 403, {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1788843808",
        }),
      ),
    );
    const probe = await probeFork("alice", "fork", {});
    expect(probe.state).toBe("blind");
    if (probe.state === "blind") {
      expect(probe.reason).toContain("sixty unauthenticated questions");
      expect(probe.reason).toContain("answers again at");
    }
  });

  it("is blind when the network is down and nothing is cached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const probe = await probeFork("alice", "fork", {});
    expect(probe.state).toBe("blind");
    if (probe.state === "blind") expect(probe.reason).toContain("could not be reached");
  });
});

describe("probeRun", () => {
  const run = (status: string, conclusion: string | null) => ({
    workflow_runs: [{ status, conclusion, html_url: "https://github.com/run/1" }],
  });

  it("maps a finished successful run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(run("completed", "success"))));
    expect(await probeRun("alice", "fork", {})).toEqual({
      state: "success",
      url: "https://github.com/run/1",
    });
  });

  it("maps a failed run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(run("completed", "failure"))));
    expect((await probeRun("alice", "fork", {})).state).toBe("failure");
  });

  it("maps an in-progress run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(run("in_progress", null))));
    expect((await probeRun("alice", "fork", {})).state).toBe("running");
  });

  it("is none when no run exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ workflow_runs: [] })));
    expect((await probeRun("alice", "fork", {})).state).toBe("none");
  });

  it("is none while the workflow is not yet registered (404)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Not Found" }, 404)));
    expect((await probeRun("alice", "fork", {})).state).toBe("none");
  });

  it("is blind when it cannot ask and holds no cached answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "rate limited" }, 403)));
    expect((await probeRun("alice", "fork", {})).state).toBe("blind");
  });
});

describe("probeHealth", () => {
  it("passes a healthy body through", async () => {
    const body = { ok: true, config: { ok: true } };
    vi.stubGlobal("fetch", vi.fn(async () => json(body)));
    expect(await probeHealth("https://w.example")).toEqual({
      state: "answered",
      body,
    });
  });

  it("passes a 503 body through — it is an answer, not an outage", async () => {
    const body = { ok: false, config: { ok: false, error: "SENDER_EMAIL is not set" } };
    vi.stubGlobal("fetch", vi.fn(async () => json(body, 503)));
    const probe = await probeHealth("https://w.example/");
    expect(probe).toEqual({ state: "answered", body });
  });

  it("is unreachable when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await probeHealth("https://w.example")).toEqual({ state: "unreachable" });
  });
});

describe("probeDns", () => {
  function dohAnswering(answers: Record<string, string[]>) {
    return vi.fn(async (url: string | URL) => {
      const name = new URL(String(url)).searchParams.get("name")!;
      const data = answers[name];
      return json(data ? { Answer: data.map((d) => ({ data: d })) } : { Status: 3 });
    });
  }

  it("goes green on the CNAME pair, the code and DMARC", async () => {
    vi.stubGlobal(
      "fetch",
      dohAnswering({
        "brevo1._domainkey.p.fi": ["b1.p-fi.dkim.brevo.com."],
        "brevo2._domainkey.p.fi": ["b2.p-fi.dkim.brevo.com."],
        "p.fi": ['"brevo-code:abc123"', '"v=spf1 ~all"'],
        "_dmarc.p.fi": ['"v=DMARC1; p=none"'],
      }),
    );
    expect(await probeDns("p.fi")).toEqual({
      state: "answered",
      dkim: true,
      code: true,
      dmarc: true,
    });
  });

  it("accepts the single-TXT DKIM variant", async () => {
    vi.stubGlobal(
      "fetch",
      dohAnswering({ "mail._domainkey.p.fi": ['"k=rsa; p=MIGf..."'] }),
    );
    const probe = await probeDns("p.fi");
    expect(probe.state === "answered" && probe.dkim).toBe(true);
  });

  it("reports everything missing on an empty zone — an answer, not blindness", async () => {
    vi.stubGlobal("fetch", dohAnswering({}));
    expect(await probeDns("p.fi")).toEqual({
      state: "answered",
      dkim: false,
      code: false,
      dmarc: false,
    });
  });

  it("does not mistake one CNAME of the pair for DKIM", async () => {
    vi.stubGlobal(
      "fetch",
      dohAnswering({ "brevo1._domainkey.p.fi": ["b1.p-fi.dkim.brevo.com."] }),
    );
    const probe = await probeDns("p.fi");
    expect(probe.state === "answered" && probe.dkim).toBe(false);
  });

  it("is blind when the lookup service cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await probeDns("p.fi")).toEqual({ state: "blind" });
  });
});
