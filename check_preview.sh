#!/usr/bin/env bash
#
# Compact verification for a local Loculus preview.
#
# Usage:
#   ./check_preview.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DOCS_PORT="${LOCULUS_DOCS_PORT:-3001}"
CHECK_DOCS=1

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-docs) CHECK_DOCS=0 ;;
        -h|--help)
            sed -n '2,/^set -euo/{/^set -euo/d;p;}' "$0" | sed 's/^# \{0,1\}//'
            echo "Options:"
            echo "  --skip-docs  Do not verify the docs server."
            exit 0
            ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
    shift
done

need() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "Missing required command: $1" >&2
        exit 127
    }
}

need kubectl
need curl
need jq

ok() {
    printf 'ok   %s\n' "$*"
}

fail() {
    printf 'fail %s\n' "$*" >&2
    exit 1
}

section() {
    printf '\n%s\n' "$*"
}

section "Pods"
bad_pods="$(kubectl get pods --no-headers | awk '$3 != "Running" && $3 != "Completed" {print}')"
if [[ -n "$bad_pods" ]]; then
    echo "$bad_pods" >&2
    fail "some pods are not Running or Completed"
fi
kubectl get pods --no-headers | awk '
    { counts[$3]++ }
    END {
        for (status in counts) printf "%s=%d ", status, counts[status];
        printf "\n";
    }
'
ok "pod statuses"

section "Jobs"
kubectl get jobs
if kubectl get job/loculus-config-loader >/dev/null 2>&1; then
    kubectl wait --for=condition=complete job/loculus-config-loader --timeout=5s >/dev/null
    ok "config loader completed"
else
    ok "config loader job no longer present"
fi

section "Endpoints"
curl -fsS http://127.0.0.1:3000/ >/dev/null
ok "website"
curl -fsS http://127.0.0.1:8079/ >/dev/null
ok "backend"
if [[ "$CHECK_DOCS" -eq 1 ]]; then
    curl -fsS "http://127.0.0.1:${DOCS_PORT}/" >/dev/null
    ok "docs"
fi
lapis_count="$(curl -fsS 'http://127.0.0.1:8080/cchf/sample/details?limit=1' | jq '.data | length')"
[[ "$lapis_count" -ge 0 ]] || fail "LAPIS did not return a data array"
ok "LAPIS"

section "Auth"
token_type="$(
    curl -fsS -X POST 'http://127.0.0.1:8083/realms/loculus/protocol/openid-connect/token' \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        --data 'client_id=backend-client&grant_type=password&username=testuser&password=testuser' \
        | jq -r '.token_type'
)"
[[ "$token_type" == "Bearer" ]] || fail "testuser password grant failed"
ok "testuser password grant"

section "Config"
instance="$(curl -fsS http://127.0.0.1:8079/api/config/instance)"
file_url_type="$(jq -r '.config.fileSharing.outputFileUrlType' <<<"$instance")"
[[ "$file_url_type" == "backend" ]] || fail "file sharing outputFileUrlType is '$file_url_type'"
ok "file sharing uses backend URLs"

organism_summary="$(curl -fsS http://127.0.0.1:8079/api/config/organisms | jq -r '"organisms=" + ((.organisms | length) | tostring) + " " + ((.organisms | map(.key) | join(",")))')"
echo "$organism_summary"
[[ "$organism_summary" == organisms=8* ]] || fail "expected 8 configured organisms"
ok "organism config"

section "Database"
kubectl exec deploy/loculus-database -- psql -U postgres -d loculus -c \
    "select organism, count(*) filter (where approver is not null) approved, count(*) filter (where released_at is not null) released, count(*) total from sequence_entries group by organism order by organism;"
kubectl exec deploy/loculus-database -- psql -U postgres -d loculus -c \
    "select organism, processing_status, count(*) from (select e.organism, p.processing_status from sequence_entries_preprocessed_data p join sequence_entries e on e.accession=p.accession and e.version=p.version) s group by organism, processing_status order by organism, processing_status;"

section "Summary"
ok "preview verification completed"
