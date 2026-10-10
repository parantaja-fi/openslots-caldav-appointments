// Everything the verifier can reach without a credential: the GitHub REST
// API (public repos, unauthenticated), the Worker's token-less health
// endpoint, and DNS over HTTPS. All probes swallow network failure into
// their "not there yet" state — the wizard polls, it never crashes.

/** Conditional-request cache: unauthenticated GitHub calls are limited to
 * 60/h per IP, but a 304 answered from an ETag does not count. */
export type GithubCache = Record<string, { etag: string; body: unknown }>;

/** What an unauthenticated GitHub read can honestly say: an answer (live,
 * 304-refreshed, or the last known one when today's ask failed), a proven
 * absence, or blindness — could not ask and nothing cached, with the why. */
type GithubAnswer =
  | { kind: "answer"; body: unknown }
  | { kind: "absent" }
  | { kind: "blind"; reason: string };

function blindReason(res: Response): string {
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0" && reset) {
    const at = new Date(reset * 1000).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      "GitHub answers sixty unauthenticated questions an hour from one " +
      `internet address, and this hour's are spent — it answers again at ${at}.`
    );
  }
  return `GitHub answered ${res.status} — the wizard cannot see the repository right now.`;
}

async function github(url: string, cache: GithubCache): Promise<GithubAnswer> {
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
    return cached
      ? { kind: "answer", body: cached.body }
      : { kind: "blind", reason: "GitHub could not be reached — no network, or GitHub is down." };
  }
  if (res.status === 304 && cached) return { kind: "answer", body: cached.body };
  if (res.status === 404) return { kind: "absent" };
  if (!res.ok) {
    return cached
      ? { kind: "answer", body: cached.body }
      : { kind: "blind", reason: blindReason(res) };
  }
  const body: unknown = await res.json();
  const etag = res.headers.get("etag");
  if (etag) cache[url] = { etag, body };
  return { kind: "answer", body };
}

export type ForkProbe =
  | { state: "present" }
  | { state: "absent" }
  | { state: "blind"; reason: string };

export async function probeFork(
  owner: string,
  repo: string,
  cache: GithubCache,
): Promise<ForkProbe> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const answer = await github(url, cache);
  if (answer.kind === "blind") return { state: "blind", reason: answer.reason };
  return { state: answer.kind === "answer" ? "present" : "absent" };
}

export type RunProbe =
  | { state: "none" }
  | { state: "running"; url: string }
  | { state: "success"; url: string }
  | { state: "failure"; url: string }
  | { state: "blind"; reason: string };

export async function probeRun(
  owner: string,
  repo: string,
  cache: GithubCache,
): Promise<RunProbe> {
  const url =
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
    `/actions/workflows/deploy.yml/runs?per_page=1`;
  const answer = await github(url, cache);
  if (answer.kind === "blind") return { state: "blind", reason: answer.reason };
  const body = (answer.kind === "answer" ? answer.body : null) as {
    workflow_runs?: { status: string; conclusion: string | null; html_url: string }[];
  } | null;
  const run = body?.workflow_runs?.[0];
  if (!run) return { state: "none" };
  if (run.status !== "completed") return { state: "running", url: run.html_url };
  return run.conclusion === "success"
    ? { state: "success", url: run.html_url }
    : { state: "failure", url: run.html_url };
}

/** Where the fork's deploy landed, published by the deploy workflow into
 * the Pages artifact. Fetched from the constructed github.io URL — the
 * one place construction is safe, since Pages redirects it to any custom
 * domain and serves CORS-* throughout; the values inside are the real
 * ones, read from the deploy itself. */
export interface DeployInfo {
  worker_url: string;
  page_origin: string;
  base_path: string;
}

export async function probeDeployInfo(owner: string, repo: string): Promise<DeployInfo | null> {
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  try {
    const res = await fetch(`https://${owner}.github.io/${repo}/deploy-info.json`, {
      cache: "no-cache",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<DeployInfo>;
    return typeof body.worker_url === "string" &&
      body.worker_url &&
      typeof body.page_origin === "string"
      ? (body as DeployInfo)
      : null;
  } catch {
    return null;
  }
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

// Throws on a failed ask — an empty answer to a successful ask is a
// legitimate "no such records", a failed ask is blindness, and the two
// must not be conflated.
async function doh(name: string, type: "TXT" | "CNAME"): Promise<string[]> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!res.ok) throw new Error(`DoH answered ${res.status}`);
  const body = (await res.json()) as { Answer?: { data: string }[] };
  return (body.Answer ?? []).map((a) => a.data);
}

/** Presence of the records `SETUP.md` Part 4 has the practitioner place.
 * Presence only — the authoritative per-record verdict is Brevo's own and
 * needs its API key, which belongs to the M6 stage, not here. */
export type DnsProbe =
  | { state: "answered"; dkim: boolean; code: boolean; dmarc: boolean }
  | { state: "blind" };

export async function probeDns(domain: string): Promise<DnsProbe> {
  try {
    const [brevo1, brevo2, mail, apex, dmarc] = await Promise.all([
      doh(`brevo1._domainkey.${domain}`, "CNAME"),
      doh(`brevo2._domainkey.${domain}`, "CNAME"),
      doh(`mail._domainkey.${domain}`, "TXT"),
      doh(domain, "TXT"),
      doh(`_dmarc.${domain}`, "TXT"),
    ]);
    return {
      state: "answered",
      // Either the CNAME pair or the single-TXT variant Brevo hands some
      // accounts (`SETUP.md` Part 4).
      dkim: (brevo1.length > 0 && brevo2.length > 0) || mail.length > 0,
      code: apex.some((t) => t.includes("brevo-code")),
      dmarc: dmarc.some((t) => t.includes("v=DMARC1")),
    };
  } catch {
    return { state: "blind" };
  }
}
