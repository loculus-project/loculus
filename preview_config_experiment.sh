#!/usr/bin/env bash
#
# Create a local config-experiment preview with local images, preprocessing,
# ingest, file sharing/S3, and test accounts enabled.
#
# Common usage:
#   ./preview_config_experiment.sh fresh --docs --wait-ingest
#
# The script creates the k3d cluster before building images because
# build-local-images.sh imports the images into the running cluster.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

CLUSTER="${LOCULUS_K3D_CLUSTER:-testCluster}"
RELEASE="${LOCULUS_HELM_RELEASE:-preview}"
CHART="$ROOT/kubernetes/loculus"
DOCS_PORT="${LOCULUS_DOCS_PORT:-3001}"

MODE="${1:-}"
if [[ "$MODE" == "fresh" || "$MODE" == "up" ]]; then
    shift
else
    MODE="up"
fi

BUILD_IMAGES=1
START_DOCS=1
WAIT_INGEST=0
ENABLE_INGEST=1
ENABLE_PREPROCESSING=1
ALLOW_OTHER_BRANCH=0

usage() {
    sed -n '2,/^set -euo/{/^set -euo/d;p;}' "$0" | sed 's/^# \{0,1\}//'
    cat <<EOF

Modes:
  fresh  Delete and recreate the k3d cluster before deploying.
  up     Reuse the existing cluster if present. This is the default.

Options:
  --docs                 Start docs on http://127.0.0.1:${DOCS_PORT}/ (default).
  --skip-docs            Do not start docs.
  --wait-ingest          Wait for ingest runner jobs to complete.
  --skip-build           Do not build/import local images.
  --skip-ingest          Deploy without ingest cronjobs/jobs.
  --skip-preprocessing   Deploy without preprocessing deployments.
  --allow-other-branch   Do not require the config-experiment branch.
  -h, --help             Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --docs) START_DOCS=1 ;;
        --skip-docs) START_DOCS=0 ;;
        --wait-ingest) WAIT_INGEST=1 ;;
        --skip-build) BUILD_IMAGES=0 ;;
        --skip-ingest) ENABLE_INGEST=0 ;;
        --skip-preprocessing) ENABLE_PREPROCESSING=0 ;;
        --allow-other-branch) ALLOW_OTHER_BRANCH=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

log() {
    printf '\n==> %s\n' "$*"
}

need() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "Missing required command: $1" >&2
        exit 127
    }
}

run() {
    printf '+'
    printf ' %q' "$@"
    printf '\n'
    "$@"
}

need git
need k3d
need kubectl
need helm
need docker
need python3
need curl

branch="$(git branch --show-current)"
if [[ "$ALLOW_OTHER_BRANCH" -ne 1 && "$branch" != "config-experiment" ]]; then
    echo "Refusing to deploy from branch '$branch'; expected config-experiment." >&2
    echo "Pass --allow-other-branch only if you intentionally want this." >&2
    exit 2
fi

if [[ "$MODE" == "fresh" ]]; then
    if k3d cluster list "$CLUSTER" >/dev/null 2>&1; then
        log "Deleting existing k3d cluster '$CLUSTER'"
        run k3d cluster delete "$CLUSTER"
    fi
fi

log "Creating/validating k3d cluster '$CLUSTER'"
run python3 ./deploy.py cluster

if [[ "$BUILD_IMAGES" -eq 1 ]]; then
    log "Building and importing local images"
    run ./build-local-images.sh
else
    log "Skipping local image build/import"
fi

helm_args=(
    upgrade --install "$RELEASE" "$CHART"
    --set environment=local
    --set branch=local
    -f "$CHART/values_e2e_and_dev.yaml"
    -f "$CHART/values_local_images.yaml"
    --skip-schema-validation
    --timeout 15m
    --set-string secrets.ingest-ncbi.data.api-key=
)

if [[ "$ENABLE_PREPROCESSING" -eq 1 ]]; then
    helm_args+=(--set disablePreprocessing=false)
else
    helm_args+=(--set disablePreprocessing=true)
fi

if [[ "$ENABLE_INGEST" -eq 1 ]]; then
    helm_args+=(--set disableIngest=false)
else
    helm_args+=(--set disableIngest=true)
fi

log "Deploying Helm release '$RELEASE'"
run helm "${helm_args[@]}"

log "Waiting for config loader"
kubectl wait --for=condition=complete job/loculus-config-loader --timeout=15m

log "Waiting for deployments"
kubectl wait --for=condition=available deployment --all --timeout=15m

if [[ "$START_DOCS" -eq 1 ]]; then
    if curl -fsS "http://127.0.0.1:${DOCS_PORT}/" >/dev/null 2>&1; then
        log "Docs already running at http://127.0.0.1:${DOCS_PORT}/"
    else
        log "Starting docs at http://127.0.0.1:${DOCS_PORT}/"
        mkdir -p logs
        (
            cd docs
            nohup npm run dev -- --host 127.0.0.1 --port "$DOCS_PORT" > ../logs/docs-preview.log 2>&1 &
            echo $! > ../logs/docs-preview.pid
        )
        for _ in {1..60}; do
            if curl -fsS "http://127.0.0.1:${DOCS_PORT}/" >/dev/null 2>&1; then
                break
            fi
            sleep 1
        done
        curl -fsS "http://127.0.0.1:${DOCS_PORT}/" >/dev/null
    fi
fi

if [[ "$WAIT_INGEST" -eq 1 && "$ENABLE_INGEST" -eq 1 ]]; then
    log "Waiting for ingest runner jobs"
    kubectl wait --for=condition=complete job -l loculus-ingest-runner=true --timeout=45m
fi

log "Running compact verification"
check_args=()
if [[ "$START_DOCS" -ne 1 ]]; then
    check_args+=(--skip-docs)
fi
"$ROOT/check_preview.sh" "${check_args[@]}"

cat <<EOF

Preview URLs:
  website  http://127.0.0.1:3000/
  docs     http://127.0.0.1:${DOCS_PORT}/
  backend  http://127.0.0.1:8079/
  LAPIS    http://127.0.0.1:8080/
  keycloak http://127.0.0.1:8083/
EOF
