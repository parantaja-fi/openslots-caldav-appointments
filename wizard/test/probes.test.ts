import { afterEach, describe, expect, it, vi } from "vitest";
import type { GithubCache } from "../src/probes";
import {
  githubPaced,
  probeDeployInfo,
  probeDeployment,
  probeDns,
  probeFork,
  probeHealth,
  probeRecord,
  probeRun,
} from "../src/probes";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("probeFork", () => {
  it("is present when the repository answers, saying whether Pages is on", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ name: "fork", has_pages: false })));
    expect(await probeFork("alice", "fork", { answers: {} })).toEqual({
      state: "present",
      pages: false,
    });
    vi.stubGlobal("fetch", vi.fn(async () => json({ name: "fork", has_pages: true })));
    expect(await probeFork("alice", "fork", { answers: {} })).toEqual({
      state: "present",
      pages: true,
    });
  });

  it("is absent on 404 — a proven no, not blindness", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Not Found" }, 404)));
    expect(await probeFork("alice", "fork", { answers: {} })).toEqual({ state: "absent" });
  });

  it("answers a 304 from the ETag cache without re-reading the body", async () => {
    const cache: GithubCache = { answers: {} };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ name: "fork" }, 200, { etag: 'W/"abc"' }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeFork("alice", "fork", cache)).toEqual({ state: "present", pages: false });
    expect(await probeFork("alice", "fork", cache)).toEqual({ state: "present", pages: false });
    const second = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(new Headers(second.headers).get("if-none-match")).toBe('W/"abc"');
  });

  it("keeps the last answer when rate-limited", async () => {
    const cache: GithubCache = { answers: {} };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ name: "fork" }, 200, { etag: 'W/"abc"' }))
      .mockResolvedValueOnce(json({ message: "rate limited" }, 403));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeFork("alice", "fork", cache)).toEqual({ state: "present", pages: false });
    expect(await probeFork("alice", "fork", cache)).toEqual({ state: "present", pages: false });
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
    const probe = await probeFork("alice", "fork", { answers: {} });
    expect(probe.state).toBe("blind");
    if (probe.state === "blind") {
      expect(probe.reason).toContain("sixty unauthenticated questions");
      expect(probe.reason).toContain("answers again at");
    }
  });

  it("is blind when the network is down and nothing is cached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const probe = await probeFork("alice", "fork", { answers: {} });
    expect(probe.state).toBe("blind");
    if (probe.state === "blind") expect(probe.reason).toContain("could not be reached");
  });
});

describe("the hour's allowance", () => {
  it("is read from every answer, a 304 included", async () => {
    const cache: GithubCache = { answers: {} };
    const limit = { "x-ratelimit-remaining": "41", "x-ratelimit-reset": "1791660000" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ name: "fork" }, 200, { etag: 'W/"abc"', ...limit }))
        .mockResolvedValueOnce(
          new Response(null, { status: 304, headers: { ...limit, "x-ratelimit-remaining": "40" } }),
        ),
    );
    await probeFork("alice", "fork", cache);
    expect(cache).toMatchObject({ remaining: 41, reset: 1_791_660_000_000 });
    await probeFork("alice", "fork", cache);
    expect(cache.remaining).toBe(40);
  });

  it("paces background rounds to last the hour, holding ten back for presses", () => {
    const now = 1_000_000_000;
    const hour = (remaining: number) => ({ answers: {}, remaining, reset: now + 3_600_000 });
    expect(githubPaced({ answers: {} }, 4, now, now)).toBe(true);
    // 50 spare over the hour: one question per 72 s, a round of two per 144 s.
    expect(githubPaced(hour(60), 1, now - 71_000, now)).toBe(false);
    expect(githubPaced(hour(60), 1, now - 72_000, now)).toBe(true);
    expect(githubPaced(hour(60), 2, now - 72_000, now)).toBe(false);
    expect(githubPaced(hour(10), 1, 0, now)).toBe(false);
    expect(githubPaced({ ...hour(0), reset: now }, 1, now, now)).toBe(true);
  });
});

describe("probeDeployment", () => {
  it("reports where the latest Pages deployment published the page, and when", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([{ id: 7, created_at: "2026-10-10T19:21:56Z" }]))
      .mockResolvedValueOnce(
        json([{ state: "success", environment_url: "https://www.example.fi/fork/" }]),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeDeployment("alice", "fork", { answers: {} })).toEqual({
      state: "present",
      url: "https://www.example.fi/fork/",
      at: Date.parse("2026-10-10T19:21:56Z"),
    });
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/repos/alice/fork/deployments?environment=github-pages&per_page=1",
    );
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/deployments/7/statuses?per_page=1");
  });

  it("has no address while the deployment is in progress", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json([{ id: 7, created_at: "2026-10-10T19:21:56Z" }]))
        .mockResolvedValueOnce(json([{ state: "in_progress", environment_url: "" }])),
    );
    expect(await probeDeployment("alice", "fork", { answers: {} })).toMatchObject({ url: "" });
  });

  it("is none before the first deploy, asking once", async () => {
    const fetchMock = vi.fn(async () => json([]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeDeployment("alice", "fork", { answers: {} })).toEqual({ state: "none" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("probeDeployInfo", () => {
  it("reads the deploy's note at the page's real address", async () => {
    const info = {
      worker_url: "https://w.example",
      page_origin: "https://www.example.fi",
      base_path: "/fork",
    };
    const fetchMock = vi.fn(async () => json(info));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeDeployInfo("https://www.example.fi/fork/")).toEqual(info);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
      "https://www.example.fi/fork/deploy-info.json",
    );
  });
});

describe("probeRun", () => {
  const run = (status: string, conclusion: string | null) => ({
    workflow_runs: [
      {
        status,
        conclusion,
        html_url: "https://github.com/run/1",
        run_started_at: "2026-10-10T14:18:27Z",
      },
    ],
  });

  it("maps a finished successful run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(run("completed", "success"))));
    expect(await probeRun("alice", "fork", { answers: {} })).toEqual({
      state: "success",
      url: "https://github.com/run/1",
      at: Date.parse("2026-10-10T14:18:27Z"),
    });
  });

  it("maps a failed run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(run("completed", "failure"))));
    expect((await probeRun("alice", "fork", { answers: {} })).state).toBe("failure");
  });

  it("maps an in-progress run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(run("in_progress", null))));
    expect((await probeRun("alice", "fork", { answers: {} })).state).toBe("running");
  });

  it("is none when no run exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ workflow_runs: [] })));
    expect((await probeRun("alice", "fork", { answers: {} })).state).toBe("none");
  });

  it("is none while the workflow is not yet registered (404)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Not Found" }, 404)));
    expect((await probeRun("alice", "fork", { answers: {} })).state).toBe("none");
  });

  it("is blind when it cannot ask and holds no cached answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "rate limited" }, 403)));
    expect((await probeRun("alice", "fork", { answers: {} })).state).toBe("blind");
  });
});

describe("probeRecord", () => {
  const record = {
    about: "Written by the setup wizard",
    repository: "Alice/fork",
    forked_from: "parantaja-fi/openslots-caldav-appointments",
    forked_at: "2026-09-07T07:10:12Z",
    stored_at: "2026-10-10T08:15:00.000Z",
  };
  // GitHub wraps the base64 at sixty characters.
  const file = (body: unknown) =>
    json({ content: Buffer.from(JSON.stringify(body)).toString("base64").replace(/.{60}/g, "$&\n") });

  it("reads the store moment from this fork's own record", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => file(record)));
    expect(await probeRecord("alice", "fork", { answers: {} })).toEqual({
      state: "present",
      storedAt: Date.parse(record.stored_at),
    });
  });

  it("is absent before any store (404)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Not Found" }, 404)));
    expect(await probeRecord("alice", "fork", { answers: {} })).toEqual({ state: "absent" });
  });

  it("ignores a record inherited from the fork's parent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => file({ ...record, repository: "bob/fork" })));
    expect(await probeRecord("alice", "fork", { answers: {} })).toEqual({ state: "absent" });
  });

  it("takes an unreadable record for none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => file("not a record")));
    expect(await probeRecord("alice", "fork", { answers: {} })).toEqual({ state: "absent" });
  });

  it("is blind when it cannot ask and holds no cached answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "rate limited" }, 403)));
    expect((await probeRecord("alice", "fork", { answers: {} })).state).toBe("blind");
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
