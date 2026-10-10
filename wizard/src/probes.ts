// Everything the verifier can reach without a credential: the GitHub REST
// API (public repos, unauthenticated), the Worker's token-less health
// endpoint, and DNS over HTTPS. All probes swallow network failure into
// their "not there yet" state — the wizard polls, it never crashes.

import type { ForkRecord } from "./github";
import { RECORD_PATH } from "./github";

/** What the wizard keeps between GitHub questions: the last answer per
 * URL — served again when asking fails — and the hour's allowance as
 * GitHub last reported it. Unauthenticated, GitHub answers sixty
 * questions an hour per internet address, and every one counts, a 304
 * included. */
export interface GithubCache {
  answers: Record<string, { etag: string; body: unknown }>;
  /** Questions left this hour. */
  remaining?: number;
  /** When the hour restarts (epoch ms). */
  reset?: number;
}

/** Questions held back for the practitioner's own presses. */
const RESERVE = 10;

/** Whether a background round of `n` questions may go out now, the last
 * one having gone at `since`: what is left of the hour's allowance, less
 * the reserve, spread evenly over what is left of the hour. */
export function githubPaced(cache: GithubCache, n: number, since: number, now: number): boolean {
  const { remaining, reset } = cache;
  if (remaining === undefined || reset === undefined || now >= reset) return true;
  const spare = remaining - RESERVE;
  return spare >= n && now - since >= ((reset - now) * n) / spare;
}

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
  const cached = cache.answers[url];
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
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  if (remaining !== null && reset !== null) {
    cache.remaining = Number(remaining);
    cache.reset = Number(reset) * 1000;
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
  if (etag) cache.answers[url] = { etag, body };
  return { kind: "answer", body };
}

/** `pages`: whether Pages is switched on — all an unauthenticated read
 * sees of it. Its source and its address show only in a deploy. */
export type ForkProbe =
  | { state: "present"; pages: boolean }
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
  if (answer.kind === "absent") return { state: "absent" };
  return { state: "present", pages: (answer.body as { has_pages?: boolean }).has_pages === true };
}

/** `at`: when the run last started (epoch ms) — a re-run restarts it. */
export type RunProbe =
  | { state: "none" }
  | { state: "running"; url: string; at: number }
  | { state: "success"; url: string; at: number }
  | { state: "failure"; url: string; at: number }
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
    workflow_runs?: {
      status: string;
      conclusion: string | null;
      html_url: string;
      run_started_at: string;
    }[];
  } | null;
  const run = body?.workflow_runs?.[0];
  if (!run) return { state: "none" };
  const seen = { url: run.html_url, at: Date.parse(run.run_started_at) };
  if (run.status !== "completed") return { state: "running", ...seen };
  return run.conclusion === "success"
    ? { state: "success", ...seen }
    : { state: "failure", ...seen };
}

/** The wizard's record of the last store — this fork's own, that is: a
 * fork of a fork inherits its parent's, which says nothing about this
 * one. A record that cannot be read is no record. */
export type RecordProbe =
  | { state: "present"; storedAt: number }
  | { state: "absent" }
  | { state: "blind"; reason: string };

export async function probeRecord(
  owner: string,
  repo: string,
  cache: GithubCache,
): Promise<RecordProbe> {
  const url =
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
    `/contents/${RECORD_PATH}`;
  const answer = await github(url, cache);
  if (answer.kind === "blind") return { state: "blind", reason: answer.reason };
  if (answer.kind === "absent") return { state: "absent" };
  try {
    const { content } = answer.body as { content: string };
    const record = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(content), (c) => c.charCodeAt(0))),
    ) as ForkRecord;
    const storedAt = Date.parse(record.stored_at);
    return record.repository.toLowerCase() === `${owner}/${repo}`.toLowerCase() && storedAt
      ? { state: "present", storedAt }
      : { state: "absent" };
  } catch {
    return { state: "absent" };
  }
}

/** The fork's latest Pages deployment, which GitHub lists publicly — its
 * Pages settings it does not. `at`: when it was made (epoch ms); `url`:
 * where it published the page, under the account's custom domain if it
 * has one — empty until the deployment has finished. Two questions: the
 * deployment, then its latest status. */
export type DeploymentProbe =
  | { state: "none" }
  | { state: "present"; url: string; at: number }
  | { state: "blind"; reason: string };

export async function probeDeployment(
  owner: string,
  repo: string,
  cache: GithubCache,
): Promise<DeploymentProbe> {
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const list = await github(`${base}/deployments?environment=github-pages&per_page=1`, cache);
  if (list.kind === "blind") return { state: "blind", reason: list.reason };
  const deployment =
    list.kind === "answer" ? (list.body as { id: number; created_at: string }[])[0] : undefined;
  if (!deployment) return { state: "none" };
  const statuses = await github(`${base}/deployments/${deployment.id}/statuses?per_page=1`, cache);
  if (statuses.kind === "blind") return { state: "blind", reason: statuses.reason };
  const status =
    statuses.kind === "answer"
      ? (statuses.body as { environment_url?: string | null }[])[0]
      : undefined;
  return {
    state: "present",
    url: status?.environment_url ?? "",
    at: Date.parse(deployment.created_at),
  };
}

/** Where the fork's deploy landed, published by the deploy workflow into
 * the Pages artifact and fetched from the address its Pages deployment
 * reports — never from a github.io address built from the username,
 * whose redirect to a custom domain carries no CORS header. */
export interface DeployInfo {
  worker_url: string;
  page_origin: string;
  base_path: string;
}

export async function probeDeployInfo(pageUrl: string): Promise<DeployInfo | null> {
  try {
    const res = await fetch(new URL("deploy-info.json", pageUrl), { cache: "no-cache" });
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
