#!/usr/bin/env bash
# Verify official Railway service bountiful-vitality after a main deploy.
# Never migrates or rolls back the production database.
set -euo pipefail

PROD_URL="${PROD_URL:-https://bountiful-vitality-production-76ab.up.railway.app}"
REPO="${GITHUB_REPOSITORY:-myyacoolmei-a11y/erp-shengfeng}"
SHA="${GITHUB_SHA:-}"
OK_CONTEXT="${RAILWAY_OK_CONTEXT:-erp-shengfeng - bountiful-vitality}"
DEADLINE_SECS="${VERIFY_DEADLINE_SECS:-480}"
MARKER="${RELEASE_MARKER:-}"

echo "official_url=${PROD_URL}"
echo "sha=${SHA}"
echo "ok_context=${OK_CONTEXT}"

deadline=$((SECONDS + DEADLINE_SECS))
railway_state=""

if [[ -n "${SHA}" ]] && command -v gh >/dev/null; then
  while (( SECONDS < deadline )); do
    railway_state="$(gh api "repos/${REPO}/commits/${SHA}/status" \
      | OK_CONTEXT="${OK_CONTEXT}" python3 -c "
import json, os, sys
ctx = os.environ['OK_CONTEXT']
data = json.load(sys.stdin)
hits = [s.get('state') for s in data.get('statuses', []) if s.get('context') == ctx]
print(hits[0] if hits else 'missing')
")"
    echo "railway ${OK_CONTEXT}: ${railway_state}"
    if [[ "${railway_state}" == "success" ]]; then
      break
    fi
    if [[ "${railway_state}" == "failure" || "${railway_state}" == "error" ]]; then
      echo "FAIL: official Railway service ${OK_CONTEXT} reported ${railway_state}" >&2
      echo "Do not roll back the production database. Inspect Railway logs for bountiful-vitality." >&2
      exit 1
    fi
    sleep 15
  done
  if [[ "${railway_state}" != "success" ]]; then
    echo "WARN: ${OK_CONTEXT} did not report success within ${DEADLINE_SECS}s (last=${railway_state}). Checking the live site anyway." >&2
  fi
fi

tmp="$(mktemp)"
code="$(curl -sS -o "${tmp}" -w "%{http_code}" --max-time 30 "${PROD_URL}/")"
if [[ "${code}" != "200" ]]; then
  echo "FAIL: official site HTTP ${code}" >&2
  exit 1
fi
if ! grep -q "晟風工程管理助手" "${tmp}"; then
  echo "FAIL: official HTML missing title 晟風工程管理助手" >&2
  exit 1
fi

health="$(curl -sS --max-time 20 "${PROD_URL}/api/healthz")"
if ! echo "${health}" | grep -q '"status":"ok"'; then
  echo "FAIL: /api/healthz not ok: ${health}" >&2
  exit 1
fi

js_path="$(grep -oE '/assets/index-[^"]+\.js' "${tmp}" | head -n1 || true)"
if [[ -z "${js_path}" ]]; then
  echo "FAIL: official HTML has no JS bundle" >&2
  exit 1
fi
js_code="$(curl -sS -o /tmp/official.js -w "%{http_code}" --max-time 30 "${PROD_URL}${js_path}")"
if [[ "${js_code}" != "200" ]]; then
  echo "FAIL: official JS ${js_path} HTTP ${js_code}" >&2
  exit 1
fi

if [[ -n "${MARKER}" ]]; then
  if ! grep -q -- "${MARKER}" /tmp/official.js; then
    echo "FAIL: official JS missing release marker ${MARKER}" >&2
    exit 1
  fi
  echo "marker_ok=${MARKER}"
fi

echo "site_ok=1 title=晟風工程管理助手 healthz=ok js=${js_path} railway=${railway_state:-skipped}"
