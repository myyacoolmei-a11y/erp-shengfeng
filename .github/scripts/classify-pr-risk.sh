#!/usr/bin/env bash
# Classify a PR as LOW_RISK, HIGH_RISK, or SKIP.
# High-risk changes (schema, payments math, inventory, deletes, auth)
# must be confirmed by the owner before merge.
set -euo pipefail

TITLE="${PR_TITLE:-}"
DRAFT="${PR_DRAFT:-false}"
BASE="${1:-}"
HEAD="${2:-}"

if [[ -z "${BASE}" || -z "${HEAD}" ]]; then
  echo "usage: classify-pr-risk.sh <base> <head>" >&2
  exit 2
fi

if [[ "${DRAFT}" == "true" ]]; then
  echo "SKIP draft"
  exit 0
fi

if echo "${TITLE}" | grep -qiE 'do not merge|donotmerge|\[high-risk\]|高風險|勿合併|需確認'; then
  echo "SKIP title"
  exit 0
fi

mapfile -t FILES < <(git diff --name-only "${BASE}...${HEAD}")

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "SKIP no-files"
  exit 0
fi

is_high_risk() {
  local f="$1"
  case "${f}" in
    standalone/server/routes/wholesale-settlements.ts) return 1 ;;
    standalone/server/routes/wholesale-orders.ts) return 1 ;;
    standalone/server/routes/health.ts) return 1 ;;
    standalone/server/lib/wholesale/wholesaleDeliveryService.ts) return 1 ;;
    standalone/server/lib/migrations/ensureWholesalePaymentRecordsMigration.ts) return 1 ;;
    standalone/shared/wholesaleSettlementLogic.ts) return 1 ;;
    standalone/server/*) return 0 ;;
    standalone/shared/schema.ts) return 0 ;;
    standalone/shared/schema/*) return 0 ;;
    standalone/drizzle.config.ts) return 0 ;;
    standalone/scripts/db-*) return 0 ;;
    standalone/shared/workOrderDispatch.ts) return 0 ;;
    standalone/shared/wholesalePaymentMath.ts) return 0 ;;
    standalone/package.json|standalone/package-lock.json) return 0 ;;
    nixpacks.toml|Dockerfile|Dockerfile.*) return 0 ;;
  esac
  [[ "${f}" == *"/migrations/"* ]] && return 0
  [[ "${f}" == *drizzle* ]] && return 0
  if [[ "${f}" == standalone/* ]]; then
    [[ "${f}" == *inventory* ]] && return 0
    [[ "${f}" == *permission* ]] && return 0
  fi
  if [[ "${f}" == standalone/shared/* ]]; then
    [[ "${f}" == *auth* ]] && return 0
    [[ "${f}" == *receivable* ]] && return 0
    [[ "${f}" == *billing* ]] && return 0
  fi
  return 1
}

high=()
for f in "${FILES[@]}"; do
  if is_high_risk "${f}"; then
    high+=("${f}")
  fi
done

if [[ ${#high[@]} -gt 0 ]]; then
  echo "HIGH_RISK"
  printf '%s\n' "${high[@]}"
  exit 0
fi

echo "LOW_RISK"
printf '%s\n' "${FILES[@]}"
