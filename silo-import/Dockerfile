# --- Rust builder stage ---
FROM rust:1.78-slim AS rust-builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
  && rm -rf /var/lib/apt/lists/*

ARG REPO=https://github.com/GenSpectrum/LAPIS-SILO.git
ARG REV=main

RUN git clone --filter=blob:none --no-checkout $REPO repo \
 && cd repo \
 && git sparse-checkout init --cone \
 && git sparse-checkout set tools/legacyNdjsonTransformer \
 && git checkout $REV

WORKDIR /build/repo/tools/legacyNdjsonTransformer
RUN cargo build --release

# --- Python runtime stage ---
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY pyproject.toml README.md /app/
COPY src /app/src

RUN pip install --no-cache-dir --upgrade pip \
    && apt-get update \
    && apt-get install -y curl zstd \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir .

# Copy the compiled Rust binary into PATH
COPY --from=rust-builder \
  /build/repo/tools/legacyNdjsonTransformer/target/release/legacy-ndjson-transformer \
  /usr/local/bin/legacy-ndjson-transformer


ENTRYPOINT ["silo-import"]
