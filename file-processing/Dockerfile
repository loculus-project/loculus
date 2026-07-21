# syntax=docker/dockerfile:1

# ── Downloader image ────────────────────────────────────────────────────────
FROM curlimages/curl:latest AS downloader

RUN curl --fail --location --show-error \
    --output /tmp/readtools.jar \
    https://github.com/loculus-project/readtools/releases/download/v1.0.0/readtools-2.15.1-all.jar

# ── Runtime image ────────────────────────────────────────────────────────────
FROM mambaorg/micromamba:2.3.3-ubuntu24.04

WORKDIR /opt/app

USER $MAMBA_USER

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yaml .mambarc ./
RUN micromamba config set extract_threads 1 \
    && micromamba install --yes --name base -f environment.yml --rc-file .mambarc \
    && micromamba clean --all --yes

ARG MAMBA_DOCKERFILE_ACTIVATE=1

COPY --chown=$MAMBA_USER:$MAMBA_USER . .

RUN uv pip install --system --no-cache .

COPY --from=downloader \
    --chown=$MAMBA_USER:$MAMBA_USER \
    /tmp/readtools.jar \
    /opt/app/lib/readtools.jar

ENV READTOOLS_JAR=/opt/app/lib/readtools.jar