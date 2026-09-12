#!/usr/bin/env bash
#
# Is the deployed site actually up, and is it pointed at contracts that exist?
#
# This is the agent half of spec 20 WP-1: after a deploy, an operator runs one command and sees a
# green or red line per thing that has to be true, without opening a Cloudflare, Privy or Pimlico
# dashboard. It only ever *reads* — there is nothing here that can change a deployment.
#
# What it checks:
#
#   1. the five public routes the demo needs (`/`, `/r/1`, `/rock/1`, `/sw.js`,
#      `/manifest.webmanifest`) answer 200 on the apex;
#   2. `https://www.bank-rock.com` ends at a 200 on the apex after its redirects. Today it does
#      not: the old Cloudflare dashboard rule 308s to a literal `:path*`, and a dashboard rule is
#      evaluated before the Worker, so the app's own redirect never runs (DEMO-STATE W-1). That is
#      reported red, with the URL it landed on, until the rule is deleted;
#   3. `/api/version` reports the chain id, the six contract addresses and the two deploy blocks it
#      is configured with, plus the size of the code the chain has at each address — read
#      server-side by the Worker on each request. Green only when every address has code.
#
# Usage:  bash scripts/check-live.sh [origin]
#
#   origin defaults to https://bank-rock.com; BANK_ROCK_WWW_URL overrides the www host, which is
#   otherwise derived from the origin.
#
# Exit status is 0 only when every line is green.

set -uo pipefail

APEX="${1:-${BANK_ROCK_URL:-https://bank-rock.com}}"
APEX="${APEX%/}"
WWW="${BANK_ROCK_WWW_URL:-${APEX/https:\/\//https://www.}}"
WWW="${WWW%/}"

CURL_TIMEOUT="${CHECK_LIVE_TIMEOUT:-20}"

GREEN=""; RED=""; BOLD=""; DIM=""; RESET=""
if [ -t 1 ]; then
  GREEN=$'\033[32m'; RED=$'\033[31m'; BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
fi

PASSED=0
FAILED=0

green() { # description, detail
  PASSED=$((PASSED + 1))
  printf '%sgreen%s  %-34s %s%s%s\n' "$GREEN" "$RESET" "$1" "$DIM" "${2:-}" "$RESET"
}

red() { # description, detail
  FAILED=$((FAILED + 1))
  printf '%sred%s    %-34s %s\n' "$RED" "$RESET" "$1" "${2:-}"
}

printf '%sBank Rock live checks%s  (%s)\n\n' "$BOLD" "$RESET" "$APEX"

# --------------------------------------------------------------------------- #
# Routes                                                                        #
# --------------------------------------------------------------------------- #

# One request, no redirect following: these routes must answer 200 themselves.
check_route() { # path, description
  local path="$1" description="$2"
  local out status
  out="$(curl -sS --max-time "$CURL_TIMEOUT" -o /dev/null \
    -w '%{http_code} %{content_type}' "${APEX}${path}" 2>&1)" || {
    red "$description" "$path — request failed: ${out}"
    return
  }
  status="${out%% *}"
  if [ "$status" = "200" ]; then
    green "$description" "$path — 200 ${out#* }"
  else
    red "$description" "$path — HTTP ${status}"
  fi
}

check_route "/" "apex serves the landing page"
check_route "/r/1" "tap route /r/1"
check_route "/rock/1" "rock page /rock/1"
check_route "/api/version" "version endpoint"
check_route "/sw.js" "service worker"
check_route "/manifest.webmanifest" "web app manifest"

# --------------------------------------------------------------------------- #
# www                                                                           #
# --------------------------------------------------------------------------- #

www_out="$(curl -sSIL --max-time "$CURL_TIMEOUT" -o /dev/null \
  -w '%{http_code} %{url_effective}' "${WWW}/" 2>&1)"
if [ $? -ne 0 ]; then
  red "www redirects to the apex" "${WWW}/ — request failed: ${www_out}"
else
  www_status="${www_out%% *}"
  www_final="${www_out#* }"
  case "$www_final" in
    *:path\**)
      red "www redirects to the apex" \
        "landed on ${www_final} — the Cloudflare rule with the literal :path* is still in front of the Worker (DEMO-STATE W-1)"
      ;;
    "${APEX}"/*|"${APEX}")
      if [ "$www_status" = "200" ]; then
        green "www redirects to the apex" "${www_final} — 200"
      else
        red "www redirects to the apex" "${www_final} — HTTP ${www_status}"
      fi
      ;;
    *)
      red "www redirects to the apex" "landed on ${www_final} — HTTP ${www_status}"
      ;;
  esac
fi

# --------------------------------------------------------------------------- #
# Configured contracts, from /api/version                                       #
# --------------------------------------------------------------------------- #

printf '\n%sconfigured chain (from %s/api/version)%s\n' "$BOLD" "$APEX" "$RESET"

version_json="$(curl -sS --max-time "$CURL_TIMEOUT" "${APEX}/api/version" 2>&1)"
if [ $? -ne 0 ] || [ -z "$version_json" ]; then
  red "chain configuration" "/api/version could not be read"
else
  # Read the JSON with whatever the machine has. The fields are named, never positional, so a
  # missing key is reported as missing rather than mistaken for something else.
  read_json() { # jq-style path expression, python expression
    if command -v jq >/dev/null 2>&1; then
      printf '%s' "$version_json" | jq -r "$1" 2>/dev/null
    elif command -v python3 >/dev/null 2>&1; then
      printf '%s' "$version_json" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    value = $2
except Exception:
    value = None
print('null' if value is None else value)
" 2>/dev/null
    else
      printf 'null'
    fi
  }

  if ! command -v jq >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
    red "chain configuration" "neither jq nor python3 is installed, so /api/version cannot be read"
  else
    stamp="$(read_json '.version' 'd.get("version","null")')"
    chain_id="$(read_json '.chain.id' 'd["chain"]["id"]')"
    if [ "$chain_id" = "null" ] || [ -z "$chain_id" ]; then
      red "chain id" "/api/version does not report a chain — is this deployment older than spec 20?"
    else
      green "chain id" "${chain_id} (build ${stamp})"
    fi

    for key in registry aquaApp aquaTaker aqua usdc weth; do
      state="$(read_json ".contracts.${key}.state" "d[\"contracts\"][\"${key}\"][\"state\"]")"
      case "$state" in
        REAL)
          address="$(read_json ".contracts.${key}.address" "d[\"contracts\"][\"${key}\"][\"address\"]")"
          size="$(read_json ".contracts.${key}.codeSize" "d[\"contracts\"][\"${key}\"][\"codeSize\"]")"
          green "contract ${key}" "${address} — ${size} bytes of code"
          ;;
        UNAVAILABLE)
          reason="$(read_json ".contracts.${key}.reason" "d[\"contracts\"][\"${key}\"][\"reason\"]")"
          red "contract ${key}" "${reason}"
          ;;
        *)
          red "contract ${key}" "/api/version reports nothing for this address"
          ;;
      esac
    done

    for block in registry aquaApp; do
      value="$(read_json ".deployBlocks.${block}" "d[\"deployBlocks\"][\"${block}\"]")"
      if [ "$value" = "null" ] || [ -z "$value" ]; then
        red "deploy block ${block}" "not configured — provenance and the fee scan have no start block"
      else
        green "deploy block ${block}" "$value"
      fi
    done
  fi
fi

# --------------------------------------------------------------------------- #

printf '\n%s%d green, %d red%s\n' "$BOLD" "$PASSED" "$FAILED" "$RESET"
[ "$FAILED" -eq 0 ] || exit 1
exit 0
