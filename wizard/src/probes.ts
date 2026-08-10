// Everything the verifier can reach without a credential: the GitHub REST
// API (public repos, unauthenticated), the Worker's token-less health
// endpoint, and DNS over HTTPS. All probes swallow network failure into
// their "not there yet" state — the wizard polls, it never crashes.

/** Conditional-request cache: unauthenticated GitHub calls are limited to
 * 60/h per IP, but a 304 answered from an ETag does not count. */
export type GithubCache = Record<string, { etag: string; body: unknown }>;

async function github(url: string, cache: GithubCache): Promise<unknown | null> {
  const cached = cache[url];
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        ...(cached ? { "if-none-match": cached.etag } : {}),
      },
    });
  } catch {
    return cached?.body ?? null;
  }
  if (res.status === 304 && cached) return cached.body;
  if (!res.ok) {
    // 404: not there. 403: rate-limited — the last known answer is still
    // the best one available.
    return res.status === 404 ? null : (cached?.body ?? null);
  }
  const body: unknown = await res.json();
  const etag = res.headers.get("etag");
  if (etag) cache[url] = { etag, body };
  return body;
}

export async function probeFork(
  owner: string,
  repo: string,
  cache: GithubCache,
): Promise<boolean> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return (await github(url, cache)) !== null;
}

export type RunProbe =
  | { state: "none" }
  | { state: "running"; url: string }
  | { state: "success"; url: string }
  | { state: "failure"; url: string };

export async function probeRun(
  owner: string,
  repo: string,
  cache: GithubCache,
): Promise<RunProbe> {
  const url =
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
    `/actions/workflows/deploy.yml/runs?per_page=1`;
  const body = (await github(url, cache)) as {
    workflow_runs?: { status: string; conclusion: string | null; html_url: string }[];
  } | null;
  const run = body?.workflow_runs?.[0];
  if (!run) return { state: "none" };
  if (run.status !== "completed") return { state: "running", url: run.html_url };
  return run.conclusion === "success"
    ? { state: "success", url: run.html_url }
    : { state: "failure", url: run.html_url };
}

/** The health body per `ARCHITECTURE.md` §3 — safe to render verbatim. */
export interface Health {
  ok: boolean;
  config: { ok: boolean; error?: string };
  calendars?: {
    availability: { ok: boolean; error?: string };
    appointments: { ok: boolean; error?: string };
  };
  email?: "configured" | "missing_key" | "off";
}

export type HealthProbe =
  | { state: "unreachable" }
  | { state: "answered"; body: Health };

export async function probeHealth(workerUrl: string): Promise<HealthProbe> {
  try {
    // A 503 carries the same JSON shape as a 200; only a non-answer is
    // "unreachable".
    const res = await fetch(`${workerUrl.replace(/\/+$/, "")}/v1/health`);
    return { state: "answered", body: (await res.json()) as Health };
  } catch {
    return { state: "unreachable" };
  }
}

async function doh(name: string, type: "TXT" | "CNAME"): Promise<string[]> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { Answer?: { data: string }[] };
    return (body.Answer ?? []).map((a) => a.data);
  } catch {
    return [];
  }
}

/** Presence of the records `SETUP.md` Part 4 has the practitioner place.
 * Presence only — the authoritative per-record verdict is Brevo's own and
 * needs its API key, which belongs to the M6 stage, not here. */
export interface DnsProbe {
  dkim: boolean;
  code: boolean;
  dmarc: boolean;
}

export async function probeDns(domain: string): Promise<DnsProbe> {
  const [brevo1, brevo2, mail, apex, dmarc] = await Promise.all([
    doh(`brevo1._domainkey.${domain}`, "CNAME"),
    doh(`brevo2._domainkey.${domain}`, "CNAME"),
    doh(`mail._domainkey.${domain}`, "TXT"),
    doh(domain, "TXT"),
    doh(`_dmarc.${domain}`, "TXT"),
  ]);
  return {
    // Either the CNAME pair or the single-TXT variant Brevo hands some
    // accounts (`SETUP.md` Part 4).
    dkim: (brevo1.length > 0 && brevo2.length > 0) || mail.length > 0,
    code: apex.some((t) => t.includes("brevo-code")),
    dmarc: dmarc.some((t) => t.includes("v=DMARC1")),
  };
}
