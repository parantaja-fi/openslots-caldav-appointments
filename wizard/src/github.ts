// The authenticated half of the wizard's GitHub traffic: writing the
// practitioner's configuration into their fork and starting the deploy,
// with a fine-grained token scoped to that one repository. api.github.com
// serves CORS with Authorization to any origin, so this needs no backend;
// the token itself lives in main.ts module memory and arrives per call.

import { seal } from "./sealedbox";

/** Carries GitHub's own error message — worth showing verbatim — and the
 * status the caller branches on. The token never appears in either. */
export class GithubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `GitHub answered ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      // keep the status line
    }
    throw new GithubError(res.status, message);
  }
  return text ? JSON.parse(text) : null;
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export interface RepoInfo {
  default_branch: string;
}

/** Doubles as token verification: a token that cannot see the fork gets a
 * 404 here, before any write is attempted. */
export function getRepo(owner: string, repo: string, token: string): Promise<RepoInfo> {
  return api(token, "GET", repoPath(owner, repo)) as Promise<RepoInfo>;
}

export interface RepoPublicKey {
  key_id: string;
  key: string;
}

export function getPublicKey(
  owner: string,
  repo: string,
  token: string,
): Promise<RepoPublicKey> {
  return api(
    token,
    "GET",
    `${repoPath(owner, repo)}/actions/secrets/public-key`,
  ) as Promise<RepoPublicKey>;
}

const toB64 = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const fromB64 = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** crypto_box_seal against the repository key, base64 — the only form the
 * secrets API accepts. Exported for the round-trip test. */
export async function encryptSecret(value: string, keyB64: string): Promise<string> {
  return toB64(await seal(new TextEncoder().encode(value), fromB64(keyB64)));
}

export async function putSecret(
  owner: string,
  repo: string,
  token: string,
  key: RepoPublicKey,
  name: string,
  value: string,
): Promise<void> {
  await api(token, "PUT", `${repoPath(owner, repo)}/actions/secrets/${name}`, {
    encrypted_value: await encryptSecret(value, key.key),
    key_id: key.key_id,
  });
}

export async function putVariable(
  owner: string,
  repo: string,
  token: string,
  name: string,
  value: string,
): Promise<void> {
  try {
    await api(token, "POST", `${repoPath(owner, repo)}/actions/variables`, { name, value });
  } catch (e) {
    // 409: it already exists — update it in place instead.
    if (!(e instanceof GithubError && e.status === 409)) throw e;
    await api(token, "PATCH", `${repoPath(owner, repo)}/actions/variables/${name}`, {
      name,
      value,
    });
  }
}

/** A fresh fork lists no workflows until a commit lands after forking
 * (`docs/fork-guided-setup.md` §7.3). An empty commit — the head's own
 * tree, re-committed — registers them while keeping the repository free
 * of configuration. */
export async function registerWorkflows(
  owner: string,
  repo: string,
  token: string,
  branch: string,
): Promise<void> {
  const git = `${repoPath(owner, repo)}/git`;
  const ref = (await api(
    token,
    "GET",
    `${git}/ref/heads/${encodeURIComponent(branch)}`,
  )) as { object: { sha: string } };
  const head = (await api(token, "GET", `${git}/commits/${ref.object.sha}`)) as {
    tree: { sha: string };
  };
  const commit = (await api(token, "POST", `${git}/commits`, {
    message: "Register the workflows",
    tree: head.tree.sha,
    parents: [ref.object.sha],
  })) as { sha: string };
  await api(token, "PATCH", `${git}/refs/heads/${encodeURIComponent(branch)}`, {
    sha: commit.sha,
  });
}

function dispatch(owner: string, repo: string, token: string, branch: string): Promise<unknown> {
  return api(
    token,
    "POST",
    `${repoPath(owner, repo)}/actions/workflows/deploy.yml/dispatches`,
    { ref: branch },
  );
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Dispatch the deploy. A 404 means the fork has never registered its
 * workflows — land the empty commit, then retry with patience, since
 * registration after a push is quick but not instant. */
export async function startDeploy(
  owner: string,
  repo: string,
  token: string,
  branch: string,
  sleep: (ms: number) => Promise<void> = pause,
): Promise<void> {
  try {
    await dispatch(owner, repo, token, branch);
    return;
  } catch (e) {
    if (!(e instanceof GithubError && e.status === 404)) throw e;
  }
  await registerWorkflows(owner, repo, token, branch);
  for (const wait of [3000, 6000, 12000]) {
    await sleep(wait);
    try {
      await dispatch(owner, repo, token, branch);
      return;
    } catch (e) {
      if (!(e instanceof GithubError && e.status === 404)) throw e;
    }
  }
  throw new GithubError(
    404,
    "The deploy workflow has not appeared on your fork yet; wait a minute and press the button again.",
  );
}
