# syntax=docker/dockerfile:1

# ── Build the validator and readtools fat JAR ────────────────────────────────
FROM eclipse-temurin:17-jdk-jammy AS java-builder

WORKDIR /build

ARG VALIDATOR_VERSION=2.15.1
ARG VALIDATOR_REPO=https://github.com/enasequence/webin-cli-validator.git
ARG READTOOLS_REPO=https://github.com/loculus-project/readtools.git

RUN apt-get update \
 && apt-get install --yes --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

# Build and install the validator into this stage's local Maven repository.
RUN git clone --depth 1 "${VALIDATOR_REPO}" webin-cli-validator \
 && cd webin-cli-validator \
 && APP_VERSION="${VALIDATOR_VERSION}" \
      ./gradlew --no-daemon publishToMavenLocal \
        -Pgitlab_private_token=x

# Build readtools, which resolves the pinned validator from ~/.m2.
RUN git clone --depth 1 "${READTOOLS_REPO}" readtools \
 && cd readtools \
 && ./gradlew --no-daemon shadowJar \
 && find build/libs -maxdepth 1 -type f -name '*.jar' -print \
 && JAR_PATH="$(find build/libs -maxdepth 1 -type f -name '*-all.jar' | head -n 1)" \
 && test -n "${JAR_PATH}" \
 && cp "${JAR_PATH}" /build/readtools.jar

# ── Runtime image ────────────────────────────────────────────────────────────
FROM mambaorg/micromamba:2.3.3-ubuntu24.04

WORKDIR /opt/app

USER $MAMBA_USER

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yaml .mambarc ./
RUN micromamba config set extract_threads 1 \
 && micromamba install --yes --name base -f environment.yaml --rc-file .mambarc \
 && micromamba clean --all --yes

ARG MAMBA_DOCKERFILE_ACTIVATE=1

COPY --chown=$MAMBA_USER:$MAMBA_USER . .

RUN uv pip install --system --no-cache .

COPY --from=java-builder \
    --chown=$MAMBA_USER:$MAMBA_USER \
    /build/readtools.jar \
    /opt/app/lib/readtools.jar

ENV READTOOLS_JAR=/opt/app/lib/readtools.jar