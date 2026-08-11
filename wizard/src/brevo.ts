// Brevo's senders/domains API, called straight from the browser —
// api.brevo.com reflects any origin (docs/fork-guided-setup.md §2). The
// key lives in main.ts module memory with the other secrets and arrives
// per call. Response shapes captured live 2026-08-11: a duplicate POST
// answers 404 with code "duplicate_parameter"; authenticate answers 400
// while Brevo cannot yet see the records.

import type { BrevoState } from "./state";

export class BrevoError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "",
  ) {
    super(message);
  }
}

async function api(
  key: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`https://api.brevo.com${path}`, {
    method,
    headers: {
      "api-key": key,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // a non-JSON body carries nothing worth keeping
  }
  if (!res.ok) {
    const err = parsed as { message?: string; code?: string } | null;
    throw new BrevoError(res.status, err?.message ?? `Brevo answered ${res.status}`, err?.code);
  }
  return parsed;
}

interface WireRecord {
  type: string;
  value: string;
  host_name: string;
  status: boolean;
}

interface WireDomain {
  authenticated?: boolean;
  dns_records?: Record<string, WireRecord | null | undefined>;
}

// dkim_record is the legacy single-TXT variant Brevo hands some
// accounts instead of the CNAME pair; whichever keys arrive are shown.
const LABELS: [string, string][] = [
  ["dkim_record", "DKIM"],
  ["dkim1Record", "DKIM 1"],
  ["dkim2Record", "DKIM 2"],
  ["brevo_code", "Brevo code"],
  ["dmarc_record", "DMARC"],
];

function toState(domain: string, body: WireDomain): BrevoState {
  return {
    domain,
    authenticated: body.authenticated === true,
    records: LABELS.flatMap(([key, label]) => {
      const r = body.dns_records?.[key];
      return r
        ? [{ label, type: r.type, host: r.host_name, value: r.value, status: r.status }]
        : [];
    }),
  };
}

export async function getDomain(key: string, domain: string): Promise<BrevoState> {
  return toState(
    domain,
    (await api(key, "GET", `/v3/senders/domains/${encodeURIComponent(domain)}`)) as WireDomain,
  );
}

/** Register the domain at Brevo; one already there is simply read back,
 * so the button is safe to press again. */
export async function createDomain(key: string, domain: string): Promise<BrevoState> {
  try {
    return toState(
      domain,
      (await api(key, "POST", "/v3/senders/domains", { name: domain })) as WireDomain,
    );
  } catch (e) {
    if (e instanceof BrevoError && e.code === "duplicate_parameter") {
      return getDomain(key, domain);
    }
    throw e;
  }
}

/** Ask Brevo to authenticate the domain: true on success, false while
 * Brevo's own resolvers cannot yet see the records. */
export async function authenticate(key: string, domain: string): Promise<boolean> {
  try {
    await api(key, "PUT", `/v3/senders/domains/${encodeURIComponent(domain)}/authenticate`);
    return true;
  } catch (e) {
    if (e instanceof BrevoError && e.status === 400) return false;
    throw e;
  }
}
