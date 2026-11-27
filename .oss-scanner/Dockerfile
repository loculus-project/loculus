# Loculus image for Anthropic's OSS Scanner (https://github.com/anthropics/oss-scanner).
#
# The scanner builds this with the repository root as the build context, then
# runs the image as root in /src WITH NO NETWORK and no init system. Everything
# the tests need is fetched here:
#   - backend:  JDK 25, Gradle and every dependency cached; Postgres and MinIO
#               binaries for USE_NONDOCKER_INFRA=true (no Docker offline)
#   - website:  Node from website/.nvmrc and node_modules
#   - preprocessing/nextclade: the conda env from its environment.yml
#   - cli:      a uv-managed .venv
# See .oss-scanner/threat_model.md for how to run each test suite.
#
# Try it locally from the repository root:
#   docker build -f .oss-scanner/Dockerfile -t loculus-scan .
#   docker run --rm -it --network none loculus-scan bash

FROM ghcr.io/loculus-project/mirror/minio:RELEASE.2025-09-07T16-13-09Z AS minio
FROM mambaorg/micromamba:2.9.0-ubuntu24.04 AS micromamba
FROM ghcr.io/astral-sh/uv:0.12.21 AS uv

# Keep the Java version in sync with backend/build.gradle and backend/Dockerfile
FROM eclipse-temurin:25-jdk-noble

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq less file procps xz-utils bzip2 \
      python3 postgresql \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s "$(ls -d /usr/lib/postgresql/*/bin | head -n1)" /opt/postgres-bin \
    && chmod 1777 /var/run/postgresql
# ^ the backend tests run Postgres as `nobody`, and Ubuntu's build puts its socket in /var/run/postgresql

COPY --from=minio /usr/bin/minio /usr/local/bin/minio
COPY --from=micromamba /bin/micromamba /usr/local/bin/micromamba
COPY --from=uv /uv /uvx /usr/local/bin/

# Read by backend/src/test/kotlin/org/loculus/backend/testutil/binary/*
ENV USE_NONDOCKER_INFRA=true \
    POSTGRES_BIN_DIR=/opt/postgres-bin \
    MINIO_BINARY=/usr/local/bin/minio \
    CI=1 \
    UV_PYTHON_INSTALL_DIR=/opt/uv-python \
    MAMBA_ROOT_PREFIX=/opt/micromamba \
    PREPROCESSING_ENV=/opt/preprocessing-env

# scanner contract: the checkout lives inside the image, at /src
COPY . /src
WORKDIR /src

# Node, at the version the website pins
RUN NODE_VERSION="$(grep -Eo '^v[0-9.]+' website/.nvmrc)" \
    && case "$(dpkg --print-architecture)" in amd64) ARCH=x64 ;; arm64) ARCH=arm64 ;; esac \
    && curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${ARCH}.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1 --exclude='*.md' --exclude=LICENSE \
    && node --version && npm --version

# Backend: build the jar and test classes, then cache everything Gradle resolves (including ktlint).
RUN cd backend \
    && ./gradlew --no-daemon --console=plain bootJar testClasses downloadDependencies

# Website
RUN cd website && npm ci && npm run build

# Preprocessing pipeline (Nextclade-based) and its test dependencies
RUN micromamba create -y -p "$PREPROCESSING_ENV" -f preprocessing/nextclade/environment.yml \
      --rc-file preprocessing/nextclade/.mambarc \
    && micromamba clean --all --yes \
    && "$PREPROCESSING_ENV/bin/uv" pip install --python "$PREPROCESSING_ENV/bin/python" \
      -e 'preprocessing/nextclade[test]'

# CLI (uv fetches the Python from cli/.python-version)
RUN cd cli && uv sync --all-extras && uv run --offline loculus --help >/dev/null

# Run the cheap tests so we know the image works offline, but do not let a failing test abort the build.
RUN cd backend && (./gradlew --no-daemon --offline --console=plain test \
      || echo "WARNING: backend tests reported failures")
RUN cd website && (npm run test || echo "WARNING: website tests reported failures")
RUN cd preprocessing/nextclade && (PATH="$PREPROCESSING_ENV/bin:$PATH" pytest -q \
      || echo "WARNING: preprocessing tests reported failures")
