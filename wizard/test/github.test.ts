import nacl from "tweetnacl";
import sealedbox from "tweetnacl-sealedbox-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GithubError,
  encryptSecret,
  getRepo,
  putSecret,
  putVariable,
  startDeploy,
} from "../src/github";

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

/** Replaces fetch with a scripted GitHub: each handler inspects the call
 * and answers with a status and body. Calls are recorded for assertion. */
function stubGithub(
  handler: (call: Call) => { status: number; body?: unknown },
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      path: url.replace("https://api.github.com", ""),
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

const instant = () => Promise.resolve();

describe("encryptSecret", () => {
  it("produces a base64 sealed box the repo key's holder can open", async () => {
    const kp = nacl.box.keyPair();
    const keyB64 = Buffer.from(kp.publicKey).toString("base64");
    const sealed = Buffer.from(await encryptSecret("hunter2", keyB64), "base64");
    const opened = sealedbox.open(new Uint8Array(sealed), kp.publicKey, kp.secretKey);
    expect(new TextDecoder().decode(opened!)).toBe("hunter2");
  });
});

describe("getRepo", () => {
  it("surfaces GitHub's own message on failure", async () => {
    stubGithub(() => ({ status: 404, body: { message: "Not Found" } }));
    await expect(getRepo("alice", "fork", "tok")).rejects.toMatchObject({
      status: 404,
      message: "Not Found",
    });
  });
});

describe("putSecret", () => {
  it("PUTs the sealed value with the key id", async () => {
    const kp = nacl.box.keyPair();
    const calls = stubGithub(() => ({ status: 201 }));
    await putSecret(
      "alice",
      "fork",
      "tok",
      { key_id: "568250167242549743", key: Buffer.from(kp.publicKey).toString("base64") },
      "BREVO_API_KEY",
      "xkeysib-abc",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "PUT",
      path: "/repos/alice/fork/actions/secrets/BREVO_API_KEY",
    });
    const body = calls[0]!.body as { encrypted_value: string; key_id: string };
    expect(body.key_id).toBe("568250167242549743");
    const opened = sealedbox.open(
      new Uint8Array(Buffer.from(body.encrypted_value, "base64")),
      kp.publicKey,
      kp.secretKey,
    );
    expect(new TextDecoder().decode(opened!)).toBe("xkeysib-abc");
  });
});

describe("putVariable", () => {
  it("creates when the variable is new", async () => {
    const calls = stubGithub(() => ({ status: 201 }));
    await putVariable("alice", "fork", "tok", "SLOT_MINUTES", "30");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/repos/alice/fork/actions/variables",
      body: { name: "SLOT_MINUTES", value: "30" },
    });
  });

  it("falls back to PATCH when it already exists", async () => {
    const calls = stubGithub((c) =>
      c.method === "POST"
        ? { status: 409, body: { message: "Variable already exists" } }
        : { status: 204 },
    );
    await putVariable("alice", "fork", "tok", "SLOT_MINUTES", "45");
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      method: "PATCH",
      path: "/repos/alice/fork/actions/variables/SLOT_MINUTES",
      body: { name: "SLOT_MINUTES", value: "45" },
    });
  });

  it("does not swallow other failures", async () => {
    stubGithub(() => ({ status: 403, body: { message: "Resource not accessible" } }));
    await expect(putVariable("alice", "fork", "tok", "X", "1")).rejects.toBeInstanceOf(
      GithubError,
    );
  });
});

describe("startDeploy", () => {
  const dispatchPath = "/repos/alice/fork/actions/workflows/deploy.yml/dispatches";

  it("dispatches straight away on a registered fork", async () => {
    const calls = stubGithub(() => ({ status: 204 }));
    await startDeploy("alice", "fork", "tok", "main", instant);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "POST", path: dispatchPath, body: { ref: "main" } });
  });

  it("lands the empty registering commit on 404, then retries", async () => {
    let registered = false;
    const calls = stubGithub((c) => {
      if (c.path === dispatchPath) {
        return registered ? { status: 204 } : { status: 404, body: { message: "Not Found" } };
      }
      if (c.path === "/repos/alice/fork/git/ref/heads/main") {
        return { status: 200, body: { object: { sha: "head1" } } };
      }
      if (c.path === "/repos/alice/fork/git/commits/head1") {
        return { status: 200, body: { tree: { sha: "tree1" } } };
      }
      if (c.method === "POST" && c.path === "/repos/alice/fork/git/commits") {
        return { status: 201, body: { sha: "empty1" } };
      }
      if (c.method === "PATCH" && c.path === "/repos/alice/fork/git/refs/heads/main") {
        registered = true;
        return { status: 200, body: {} };
      }
      throw new Error(`unexpected call ${c.method} ${c.path}`);
    });
    await startDeploy("alice", "fork", "tok", "main", instant);

    const commit = calls.find((c) => c.method === "POST" && c.path.endsWith("/git/commits"))!;
    // The empty commit: the head's own tree, head as sole parent.
    expect(commit.body).toMatchObject({ tree: "tree1", parents: ["head1"] });
    expect(calls.filter((c) => c.path === dispatchPath)).toHaveLength(2);
  });

  it("gives up with advice when the workflow never appears", async () => {
    const calls = stubGithub((c) => {
      if (c.path === dispatchPath) return { status: 404, body: { message: "Not Found" } };
      if (c.path.includes("/git/ref/")) return { status: 200, body: { object: { sha: "h" } } };
      if (c.path.includes("/git/commits/h")) return { status: 200, body: { tree: { sha: "t" } } };
      if (c.method === "POST") return { status: 201, body: { sha: "e" } };
      return { status: 200, body: {} };
    });
    await expect(startDeploy("alice", "fork", "tok", "main", instant)).rejects.toThrow(
      /press the button again/,
    );
    expect(calls.filter((c) => c.path === dispatchPath)).toHaveLength(4);
  });

  it("re-throws non-404 dispatch failures untouched", async () => {
    stubGithub(() => ({ status: 401, body: { message: "Bad credentials" } }));
    await expect(startDeploy("alice", "fork", "tok", "main", instant)).rejects.toMatchObject({
      status: 401,
      message: "Bad credentials",
    });
  });
});
