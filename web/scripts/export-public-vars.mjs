#!/usr/bin/env node
/**
 * Prints the `NEXT_PUBLIC_*` entries of `wrangler.jsonc`'s `vars` block as `KEY=VALUE` lines.
 *
 * Why this exists (D-034): non-secret configuration lives in `web/wrangler.jsonc`, which is what
 * the *running* Worker reads. But Next.js inlines `process.env.NEXT_PUBLIC_*` at **build** time —
 * a literal member access is replaced by a string literal in both the client chunks and the
 * server bundle — so a value that only reaches the Worker at runtime arrives too late to be in
 * the bundle at all. The deploy job therefore runs this script and appends its output to
 * `$GITHUB_ENV` before `npm run deploy`, so one file configures both halves.
 *
 * Usage:
 *   node scripts/export-public-vars.mjs              # KEY=VALUE lines on stdout
 *   node scripts/export-public-vars.mjs >> "$GITHUB_ENV"
 *   eval "$(node scripts/export-public-vars.mjs | sed 's/^/export /')"   # locally
 *
 * The config is JSONC — it has comments — and Wrangler's own schema allows them, so this parses
 * tolerantly rather than reaching for `JSON.parse` on the raw text. No dependency: the comment
 * stripper below is a character scanner that knows about strings and escapes, which a regular
 * expression cannot be (`"https://bank-rock.com"` contains `//` inside a string).
 *
 * Exits non-zero, with a reason on stderr, if the file is unreadable, unparseable, has no `vars`
 * block, or holds a value that cannot be written to `$GITHUB_ENV` (a non-string, or a string
 * containing a newline). Printing a half-correct environment is worse than failing the deploy.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "wrangler.jsonc");
const PUBLIC_PREFIX = "NEXT_PUBLIC_";

/**
 * Removes `//` and block comments, and trailing commas, from JSONC text.
 *
 * Comment bodies are replaced with spaces rather than deleted so that byte offsets — and so any
 * error position `JSON.parse` reports — still point at the original file.
 */
export function stripJsonComments(text) {
  let out = "";
  let index = 0;
  let inString = false;

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    if (inString) {
      if (char === "\\") {
        out += char + (next ?? "");
        index += 2;
        continue;
      }
      if (char === '"') inString = false;
      out += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") {
        out += " ";
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (let i = index; i < stop; i += 1) {
        out += text[i] === "\n" ? "\n" : " ";
      }
      index = stop;
      continue;
    }

    out += char;
    index += 1;
  }

  // Trailing commas: `,` followed only by whitespace before a `}` or `]`. Safe now that every
  // comment is whitespace and every string is still intact.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Parses `wrangler.jsonc` and returns its `vars` object. */
export function readWranglerVars(path = CONFIG_PATH) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`Cannot read ${path}: ${err.message}`);
  }

  let config;
  try {
    config = JSON.parse(stripJsonComments(raw));
  } catch (err) {
    throw new Error(`${path} is not valid JSONC: ${err.message}`);
  }

  const vars = config?.vars;
  if (!vars || typeof vars !== "object" || Array.isArray(vars)) {
    throw new Error(`${path} has no \`vars\` object — D-034 requires one.`);
  }
  return vars;
}

/** The `NEXT_PUBLIC_*` subset, as `KEY=VALUE` lines, in the order the config declares them. */
export function publicVarLines(vars) {
  const lines = [];
  for (const [name, value] of Object.entries(vars)) {
    if (!name.startsWith(PUBLIC_PREFIX)) continue;
    if (typeof value !== "string") {
      throw new Error(
        `vars.${name} is a ${typeof value}; Wrangler vars used by the build must be strings.`,
      );
    }
    if (value.includes("\n") || value.includes("\r")) {
      throw new Error(`vars.${name} contains a newline, which cannot be written to $GITHUB_ENV.`);
    }
    lines.push(`${name}=${value}`);
  }
  return lines;
}

function main() {
  const lines = publicVarLines(readWranglerVars());
  if (lines.length === 0) {
    throw new Error(
      `${CONFIG_PATH} declares no ${PUBLIC_PREFIX}* vars — the build would inline empty strings.`,
    );
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

// Only run when invoked directly, so the helpers above stay importable by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`export-public-vars: ${err.message}\n`);
    process.exit(1);
  }
}
