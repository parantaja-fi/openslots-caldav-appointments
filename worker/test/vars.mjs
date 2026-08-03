import { readFileSync } from "node:fs";

/** `KEY = "value"` lines — the shape .dev.vars, wrangler.toml and the backend
 * profiles happen to share. Lowercase keys and section headers are skipped, so
 * wrangler.toml's own settings do not leak in. */
export function parseVars(text) {
  const vars = {};
  for (const line of text.split("\n")) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    vars[match[1]] = /^(["']).*\1$/.test(match[2]) ? match[2].slice(1, -1) : match[2];
  }
  return vars;
}

let sources;

/**
 * The setting as `wrangler dev` would see it, or undefined. Reading the same
 * two files it does, in its own precedence, is what keeps a script and the
 * Worker it drives from disagreeing about which calendar is under test: the
 * calendar URLs live in wrangler.toml unless .dev.vars overrides them, so
 * looking only at .dev.vars finds nothing on a checkout that has not been
 * pointed at another backend.
 */
export function devVar(name) {
  sources ??= ["../.dev.vars", "../wrangler.toml"]
    .map(path => parseVars(readFileSync(new URL(path, import.meta.url), "utf8")));
  for (const vars of sources) if (vars[name]) return vars[name];
  return undefined;
}
