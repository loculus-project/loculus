#!/usr/bin/env bash
#
# Build every Loculus Docker image locally and import them into the running
# k3d cluster. Useful for running a fully local instance without depending on
# any image pushed to ghcr.io.
#
# Pairs with `./deploy.py helm --branch local --for-e2e --enablePreprocessing
# --enableIngest` — the chart's docker-tag helper turns `--branch local` into
# the literal tag `local`, so every container ends up running the image
# tagged here.
#
# Usage:
#   ./build-local-images.sh                  # build + import everything
#   ./build-local-images.sh --skip-import    # build only (no k3d import)
#   ./build-local-images.sh --dev            # everything EXCEPT backend + website
#                                            # (use when running those in your IDE
#                                            # alongside `./deploy.py helm --dev`)
#   ./build-local-images.sh backend website  # build just the listed components
#
# Components (each is one Docker image): backend, website, config-loader,
# config-adapter, config-processor, loculus-silo, keycloakify,
# preprocessing-nextclade, preprocessing-dummy, ingest, ena-submission,
# ena-submission-flyway, taxonomy-service.
#
# The upstream LAPIS image (ghcr.io/genspectrum/lapis) is NOT built locally;
# k3d pulls it from the public registry on first use.

set -euo pipefail

TAG="local"
CLUSTER="${LOCULUS_K3D_CLUSTER:-testCluster}"
SKIP_IMPORT=0
DEV_MODE=0

# Parse flags.
COMPONENTS=()
for arg in "$@"; do
    case "$arg" in
        --skip-import) SKIP_IMPORT=1 ;;
        --dev) DEV_MODE=1 ;;
        --help|-h)
            sed -n '2,/^set -euo/{/^set -euo/d;p;}' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) COMPONENTS+=("$arg") ;;
    esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ALL_COMPONENTS=(
    backend
    website
    config-loader
    config-adapter
    config-processor
    loculus-silo
    keycloakify
    preprocessing-nextclade
    preprocessing-dummy
    ingest
    ena-submission
    ena-submission-flyway
    taxonomy-service
)

# `--dev` is the IDE workflow: backend + website run on the host, not in the
# cluster, so we skip them by default. Explicit positional components still win.
DEV_COMPONENTS=(
    config-loader
    config-adapter
    config-processor
    loculus-silo
    keycloakify
    preprocessing-nextclade
    preprocessing-dummy
    ingest
    ena-submission
    ena-submission-flyway
    taxonomy-service
)

if [[ ${#COMPONENTS[@]} -eq 0 ]]; then
    if [[ "$DEV_MODE" -eq 1 ]]; then
        COMPONENTS=("${DEV_COMPONENTS[@]}")
    else
        COMPONENTS=("${ALL_COMPONENTS[@]}")
    fi
fi

build_backend() {
    echo ">>> Building backend (Gradle bootJar + Docker)"
    (cd backend && ./gradlew --no-daemon bootJar)
    docker build -t "ghcr.io/loculus-project/backend:${TAG}" backend
}

build_website() {
    echo ">>> Building website"
    # Website re-exports canonical Zod schemas from `../../../config-tools/...`,
    # so the website Dockerfile pulls config-tools in via a named build context.
    docker build \
        -t "ghcr.io/loculus-project/website:${TAG}" \
        --build-context config-tools=./config-tools \
        website
}

build_config_loader() {
    echo ">>> Building config-loader"
    docker build -f config-tools/Dockerfile.loader \
        -t "ghcr.io/loculus-project/config-loader:${TAG}" config-tools
}

build_config_adapter() {
    echo ">>> Building config-adapter"
    docker build -f config-tools/Dockerfile.adapter \
        -t "ghcr.io/loculus-project/config-adapter:${TAG}" config-tools
}

build_config_processor() {
    echo ">>> Building config-processor"
    docker build -t "ghcr.io/loculus-project/config-processor:${TAG}" kubernetes/config-processor
}

build_loculus_silo() {
    echo ">>> Building loculus-silo"
    docker build -t "ghcr.io/loculus-project/loculus-silo:${TAG}" loculus-silo
}

build_keycloakify() {
    echo ">>> Building keycloakify"
    docker build -t "ghcr.io/loculus-project/keycloakify:${TAG}" keycloak/keycloakify
}

build_preprocessing_nextclade() {
    echo ">>> Building preprocessing-nextclade"
    docker build -t "ghcr.io/loculus-project/preprocessing-nextclade:${TAG}" preprocessing/nextclade
}

build_preprocessing_dummy() {
    echo ">>> Building preprocessing-dummy"
    docker build -t "ghcr.io/loculus-project/preprocessing-dummy:${TAG}" preprocessing/dummy
}

build_ingest() {
    echo ">>> Building ingest"
    docker build -t "ghcr.io/loculus-project/ingest:${TAG}" ingest
}

build_ena_submission() {
    echo ">>> Building ena-submission"
    docker build -t "ghcr.io/loculus-project/ena-submission:${TAG}" ena-submission
}

build_ena_submission_flyway() {
    echo ">>> Building ena-submission-flyway"
    docker build -t "ghcr.io/loculus-project/ena-submission-flyway:${TAG}" ena-submission/flyway
}

build_taxonomy_service() {
    echo ">>> Building taxonomy-service"
    docker build -t "ghcr.io/loculus-project/taxonomy-service:${TAG}" taxonomy/taxonomy_service
}

import_image() {
    local image="$1"
    if [[ "$SKIP_IMPORT" -eq 1 ]]; then return; fi
    echo ">>> Importing $image into k3d cluster '$CLUSTER'"
    k3d image import "$image" --cluster "$CLUSTER"
}

# Map component name → build function + image name to import.
for component in "${COMPONENTS[@]}"; do
    case "$component" in
        backend)                  build_backend                  ; import_image "ghcr.io/loculus-project/backend:${TAG}" ;;
        website)                  build_website                  ; import_image "ghcr.io/loculus-project/website:${TAG}" ;;
        config-loader)            build_config_loader            ; import_image "ghcr.io/loculus-project/config-loader:${TAG}" ;;
        config-adapter)           build_config_adapter           ; import_image "ghcr.io/loculus-project/config-adapter:${TAG}" ;;
        config-processor)         build_config_processor         ; import_image "ghcr.io/loculus-project/config-processor:${TAG}" ;;
        loculus-silo)             build_loculus_silo             ; import_image "ghcr.io/loculus-project/loculus-silo:${TAG}" ;;
        keycloakify)              build_keycloakify              ; import_image "ghcr.io/loculus-project/keycloakify:${TAG}" ;;
        preprocessing-nextclade)  build_preprocessing_nextclade  ; import_image "ghcr.io/loculus-project/preprocessing-nextclade:${TAG}" ;;
        preprocessing-dummy)      build_preprocessing_dummy      ; import_image "ghcr.io/loculus-project/preprocessing-dummy:${TAG}" ;;
        ingest)                   build_ingest                   ; import_image "ghcr.io/loculus-project/ingest:${TAG}" ;;
        ena-submission)           build_ena_submission           ; import_image "ghcr.io/loculus-project/ena-submission:${TAG}" ;;
        ena-submission-flyway)    build_ena_submission_flyway    ; import_image "ghcr.io/loculus-project/ena-submission-flyway:${TAG}" ;;
        taxonomy-service)         build_taxonomy_service         ; import_image "ghcr.io/loculus-project/taxonomy-service:${TAG}" ;;
        *)
            echo "Unknown component: $component" >&2
            echo "Available: ${ALL_COMPONENTS[*]}" >&2
            exit 2
            ;;
    esac
done

echo ""
if [[ "$DEV_MODE" -eq 1 ]]; then
    echo "Done (--dev: backend + website not built). Deploy with:"
    echo "  ./deploy.py --verbose helm --branch local --dev --enablePreprocessing --enableIngest"
    echo ""
    echo "Then start backend + website in your IDE pointing at the in-cluster services"
    echo "(Postgres on :5432, Keycloak on :8083, LAPIS on :8080, S3 on :8084)."
else
    echo "Done. Deploy with:"
    echo "  ./deploy.py --verbose helm --branch local --for-e2e --enablePreprocessing --enableIngest"
fi
echo ""
echo "Note: '--branch local' makes the chart reference the ':local' image tag AND"
echo "applies kubernetes/loculus/values_local_images.yaml (imagePullPolicy=IfNotPresent)"
echo "so kubelet uses the k3d-imported images instead of trying to pull from ghcr.io."
