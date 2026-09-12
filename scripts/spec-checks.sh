#!/usr/bin/env bash
#
# Definition-of-done static checks.
#
# Every check below is transcribed from a spec's own "definition of done" section:
#
#   specs/15-exit-demo-mode.md  Part 7  — demo mode, synthesized evidence, one adapter,
#                                         one origin, fail-closed secrets, no APY
#   specs/17-mobile-ui-and-typography.md Part 7 — typography scale, viewport units, overlays
#   specs/12-deployment.md      "Configuration model (D-034)" — the committed non-secret
#                                         configuration matches what was actually deployed
#
# Only the *static* checks live here. The build, lint, typecheck, test and `npm run build`
# steps from the same sections are separate CI jobs, and the live `curl` / `cast code`
# assertions need a deployed site and a deployed contract, so they are not run here.
#
# Each check prints its spec ID, a one-line description and PASS or FAIL. A failing check
# prints the offending lines. The script exits non-zero if any check fails.
#
# Usage:  bash scripts/spec-checks.sh
#
# Deviations from the literal greps in the specs, and why:
#
#   * Build output and installed packages are excluded everywhere (node_modules, .next,
#     .open-next, dist, coverage, .git). A `pages.dev` string inside a dependency is not a
#     violation of decision D-022, and whether the check passes must not depend on whether
#     someone has run `npm ci` first.
#   * `--exclude-dir=chain` is used, never `--exclude-dir=lib/chain`: GNU grep matches
#     --exclude-dir against the directory's basename, so the path form silently matches
#     nothing and the check would pass vacuously. This is called out in spec 15 Part 7 itself.
#   * A check whose target file or directory is missing FAILs rather than passing quietly. An
#     absent path makes a "must not contain" grep succeed for the wrong reason.

set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
REPO_ROOT="$(pwd)"

PASSED=0
FAILED=0
FAILED_IDS=()

BOLD=""; RED=""; GREEN=""; DIM=""; RESET=""
if [ -t 1 ]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; RESET=$'\033[0m'
fi

EXCLUDES=(
  --exclude-dir=node_modules
  --exclude-dir=.next
  --exclude-dir=.open-next
  --exclude-dir=.dist-pages
  --exclude-dir=dist
  --exclude-dir=coverage
  --exclude-dir=.git
  --exclude-dir=artifacts
  --exclude-dir=cache
  --exclude=*.tsbuildinfo
  --exclude=*.map
)

pass() { # id, description
  PASSED=$((PASSED + 1))
  printf '%s  %-8s %s\n' "${GREEN}PASS${RESET}" "$1" "$2"
}

fail() { # id, description, detail
  FAILED=$((FAILED + 1))
  FAILED_IDS+=("$1")
  printf '%s  %-8s %s\n' "${RED}FAIL${RESET}" "$1" "$2"
  if [ -n "${3:-}" ]; then
    printf '%s\n' "$3" | head -n 12 | cut -c 1-200 | sed "s/^/        ${DIM}|${RESET} /"
    local total
    total="$(printf '%s\n' "$3" | wc -l | tr -d ' ')"
    if [ "$total" -gt 12 ]; then
      printf '        %s... %s more line(s)%s\n' "$DIM" "$((total - 12))" "$RESET"
    fi
  fi
}

# Every path the check reads must exist, or the check is meaningless.
paths_exist() { # id, description, paths...
  local id="$1" desc="$2"; shift 2
  local missing=()
  local p
  for p in "$@"; do
    [ -e "$REPO_ROOT/$p" ] || missing+=("$p")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    fail "$id" "$desc" "path(s) not found: ${missing[*]}"
    return 1
  fi
  return 0
}

# Passes when the given grep finds nothing.
expect_absent() { # id, description, path-count, paths..., grep-args...
  local id="$1" desc="$2" npaths="$3"; shift 3
  local paths=("${@:1:$npaths}")
  shift "$npaths"
  paths_exist "$id" "$desc" "${paths[@]}" || return
  local out
  out="$(grep "$@" "${EXCLUDES[@]}" -- "${paths[@]}" 2>/dev/null)" || true
  if [ -n "$out" ]; then
    fail "$id" "$desc" "$out"
  else
    pass "$id" "$desc"
  fi
}

# Passes when the given grep finds at least one match.
expect_present() { # id, description, path-count, paths..., grep-args...
  local id="$1" desc="$2" npaths="$3"; shift 3
  local paths=("${@:1:$npaths}")
  shift "$npaths"
  paths_exist "$id" "$desc" "${paths[@]}" || return
  local out
  out="$(grep "$@" "${EXCLUDES[@]}" -- "${paths[@]}" 2>/dev/null)" || true
  if [ -n "$out" ]; then
    pass "$id" "$desc"
  else
    fail "$id" "$desc" "no match found in: ${paths[*]}"
  fi
}

section() {
  printf '\n%s%s%s\n' "$BOLD" "$1" "$RESET"
}

printf '%sBank Rock definition-of-done checks%s  (%s)\n' "$BOLD" "$RESET" "$REPO_ROOT"

# ---------------------------------------------------------------------------
section "specs/15-exit-demo-mode.md — Part 7"
# ---------------------------------------------------------------------------

# D-014 — no synthesized transaction identifiers, ever.
expect_absent "D-014a" "no random hash generation in web/src" \
  1 "web/src" \
  -rE 'Math\.random\(\)[^;]*16\)\.toString\(16\)'

expect_absent "D-014b" "no template-literal tx hashes in web/src (the viem \`0x\${string}\` type is allowed)" \
  1 "web/src" \
  -rP '(txHash|Hash)\s*=\s*`0x\$\{(?!string\})'

# D-015 — one source of truth for every address.
expect_absent "D-015" "no 20-byte address literal outside web/src/lib/chain" \
  1 "web/src" \
  -rE --exclude='*.test.ts' --exclude='*.test.tsx' '0x[a-fA-F0-9]{40}' --exclude-dir=chain

# D-013 — demo mode never defaults on in production.
expect_present "D-013a" "deploy workflow sets NEXT_PUBLIC_DEMO_MODE: \"false\" explicitly" \
  1 ".github/workflows/deploy.yml" \
  -F 'NEXT_PUBLIC_DEMO_MODE: "false"'

expect_absent "D-013b" "no fabricated sign-in left in web/src (A-1, A-2)" \
  1 "web/src" \
  -rE 'DEMO_WALLET_ADDRESS|clp1234567890abcdef123456|bankrock_auth_demo_session'

# D-016 — one Cloudflare adapter.
expect_absent "D-016" "@cloudflare/next-on-pages is not referenced anywhere in web/" \
  1 "web" \
  -r --exclude-dir=audit -F '@cloudflare/next-on-pages'

# D-017 — fail closed: a missing secret must not mean "no authentication".
expect_absent "D-017" "no 'if (SECRET && mismatch)' authentication bypass in the API routes" \
  1 "web/src/app/api" \
  -rE 'if \([A-Za-z_.]*[A-Z_]{4,}[A-Za-z_.]* && '

# D-022 — one canonical origin, https://bank-rock.com.
# web3-functions/ was dropped from this check when the Gelato keeper was deleted (D-035);
# it no longer exists for grep to walk.
expect_absent "D-022" "no bankrock.xyz or pages.dev origin literals" \
  2 "web/src" "mcp" \
  -rE 'bankrock\.xyz|pages\.dev'

# D-004 — yield claims are not made at all.
expect_absent "D-004" "no APY/APR wording in web/src/components" \
  1 "web/src/components" \
  -riE '\bAPY\b|\bAPR\b'

# ---------------------------------------------------------------------------
section "specs/17-mobile-ui-and-typography.md — Part 7"
# ---------------------------------------------------------------------------

expect_present "T-1" "globals.css wires the Inter font variable" \
  1 "web/src/app/globals.css" \
  -F 'var(--font-inter)'

expect_absent "T-2" "globals.css has no self-referential --font-sans declaration" \
  1 "web/src/app/globals.css" \
  -E '^[[:space:]]*--font-sans:[[:space:]]*var\(--font-sans\)'

expect_absent "T-3" "layout.tsx does not load Geist" \
  1 "web/src/app/layout.tsx" \
  -F 'Geist('

expect_absent "T-5a" "no arbitrary Tailwind text sizes" \
  1 "web/src" \
  -rE 'text-\[[0-9.]+(px|rem)\]'

expect_absent "T-5b" "text-xs is not used as a size (the theme line --text-xs: initial in globals.css is the fix)" \
  1 "web/src" \
  -rE --include='*.tsx' --include='*.ts' '\btext-xs\b'

expect_absent "L-1a" "no viewport-height utilities" \
  1 "web/src" \
  -rE '\b(h|min-h|max-h)-(screen|\[[0-9]+vh\])'

expect_present "L-1b" "globals.css accounts for safe-area insets" \
  1 "web/src/app/globals.css" \
  -F 'safe-area-inset'

expect_absent "L-5" "no ad-hoc scroll lock via document.body.style.overflow" \
  1 "web/src" \
  -r -F 'document.body.style.overflow'

expect_absent "L-6" "no pixel drag thresholds" \
  1 "web/src" \
  -rE 'dragConstraints=\{\{'

expect_absent "T-8" "no raw low-contrast text colour classes in components" \
  1 "web/src" \
  -rE 'text-(neutral-(300|400)|green-600|yellow-600|amber-600)\b' --include='*.tsx'

# T-7: display tracking belongs only on display type, so `tracking-tighter` is allowed only on
# a line that also carries `text-display`. This one needs a second filter, so it is not a plain
# expect_absent.
t7_id="T-7"
t7_desc="tracking-tighter appears only alongside text-display"
if paths_exist "$t7_id" "$t7_desc" "web/src"; then
  t7_out="$(grep -rE 'tracking-tighter' "${EXCLUDES[@]}" -- "web/src" 2>/dev/null | grep -v 'text-display')" || true
  if [ -n "$t7_out" ]; then
    fail "$t7_id" "$t7_desc" "$t7_out"
  else
    pass "$t7_id" "$t7_desc"
  fi
fi

# ---------------------------------------------------------------------------
section "specs/12-deployment.md — configuration model (D-034)"
# ---------------------------------------------------------------------------

# D-034 — non-secret configuration lives in web/wrangler.jsonc `vars`, and the deploy scripts
# record what they actually deployed in contracts/deployments/*.json. Drift between the two is the
# bug this decision exists to prevent: the NEXT_PUBLIC_* values are inlined into the bundle at
# build time, so a stale address there points the whole app at a contract we did not deploy, on a
# deploy that looks green. Addresses are compared case-insensitively — the two files carry
# different EIP-55 checksum spellings of the same address, which is not drift.
#
# wrangler.jsonc is JSONC (it has comments), so it is parsed by the same tolerant parser the
# deploy job uses, web/scripts/export-public-vars.mjs, rather than by a second grep.
d034_id="D-034"
d034_desc="web/wrangler.jsonc vars match contracts/deployments/*.json"
if paths_exist "$d034_id" "$d034_desc" \
    "web/wrangler.jsonc" "web/scripts/export-public-vars.mjs" \
    "contracts/deployments/sepolia.json" "contracts/deployments/sepolia-aqua-app.json"; then
  if ! command -v node >/dev/null 2>&1; then
    fail "$d034_id" "$d034_desc" "node is needed to parse web/wrangler.jsonc, and is not on PATH"
  else
    d034_out="$(node --input-type=module -e '
      import { readFileSync } from "node:fs";
      const { readWranglerVars } = await import("./web/scripts/export-public-vars.mjs");
      const vars = readWranglerVars();
      const json = (p) => JSON.parse(readFileSync(p, "utf8"));
      const registry = json("contracts/deployments/sepolia.json");
      const aquaApp = json("contracts/deployments/sepolia-aqua-app.json");
      const expected = [
        ["NEXT_PUBLIC_CHAIN_ID", registry.chainId, "number", "sepolia.json chainId"],
        ["NEXT_PUBLIC_REGISTRY_ADDRESS", registry.address, "address", "sepolia.json address"],
        ["REGISTRY_DEPLOY_BLOCK", registry.deployBlock, "number", "sepolia.json deployBlock"],
        ["NEXT_PUBLIC_AQUA_ADDRESS", aquaApp.aqua, "address", "sepolia-aqua-app.json aqua"],
        ["NEXT_PUBLIC_AQUA_APP_ADDRESS", aquaApp.app.address, "address", "sepolia-aqua-app.json app.address"],
        ["AQUA_APP_DEPLOY_BLOCK", aquaApp.app.deployBlock, "number", "sepolia-aqua-app.json app.deployBlock"],
        ["NEXT_PUBLIC_AQUA_TAKER_ADDRESS", aquaApp.taker.address, "address", "sepolia-aqua-app.json taker.address"],
      ];
      const problems = [];
      for (const [name, want, kind, source] of expected) {
        const got = vars[name];
        if (typeof got !== "string" || got.trim() === "") {
          problems.push(name + " is not set in web/wrangler.jsonc vars (expected " + want + ", from " + source + ")");
          continue;
        }
        const norm = (v) => (kind === "address" ? String(v).trim().toLowerCase() : String(v).trim());
        if (norm(got) !== norm(want)) {
          problems.push(name + " is " + got + " but " + source + " says " + want);
        }
      }
      if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
    ' 2>&1)" || true
    if [ -n "$d034_out" ]; then
      fail "$d034_id" "$d034_desc" "$d034_out"
    else
      pass "$d034_id" "$d034_desc"
    fi
  fi
fi

# ---------------------------------------------------------------------------
printf '\n%s%d passed, %d failed%s\n' "$BOLD" "$PASSED" "$FAILED" "$RESET"
if [ "$FAILED" -gt 0 ]; then
  printf 'failing checks: %s\n' "${FAILED_IDS[*]}"
  exit 1
fi
exit 0
