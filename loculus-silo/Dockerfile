# --- Rust builder stage ---
FROM rust:1.92-slim AS rust-builder

WORKDIR /build

ARG REPO=https://github.com/GenSpectrum/LAPIS-SILO.git
ARG COMMIT=8d38b2739524cca52857d9d09ff05e9373cea4df

# Install the binary into /usr/local/cargo/bin
RUN cargo install --git $REPO --rev $COMMIT

# --- RhyDB binary download stage ---
FROM curlimages/curl:8.12.1 AS rhydb-downloader

ARG RHYDB_VERSION=0.17.3
ARG TARGETARCH

RUN curl -sfL "https://github.com/RhyOrg/RhyDB/releases/download/v${RHYDB_VERSION}/rhydb-linux-${TARGETARCH}.tar.gz" \
    | tar -xz -C /tmp && mv /tmp/rhydb-linux-${TARGETARCH} /tmp/rhydb && chmod +x /tmp/rhydb

# --- Python runtime stage ---
FROM python:3.11-slim

# The python bindings must match the RhyDB binary version, otherwise the API cannot load the saved databases
ARG RHYDB_VERSION=0.17.3
ARG TARGETARCH

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY pyproject.toml README.md /app/
COPY src /app/src

RUN pip install --no-cache-dir --upgrade pip \
    && apt-get update \
    && apt-get install -y --no-install-recommends zstd \
    && rm -rf /var/lib/apt/lists/* \
    && WHEEL_ARCH=$([ "$TARGETARCH" = "arm64" ] && echo aarch64 || echo x86_64) \
    && pip install --no-cache-dir "https://github.com/RhyOrg/RhyDB/releases/download/v${RHYDB_VERSION}/rhydb-${RHYDB_VERSION}-cp311-cp311-manylinux_2_35_${WHEEL_ARCH}.whl" \
    && pip install --no-cache-dir .

# Copy the compiled Rust binary into PATH
COPY --from=rust-builder /usr/local/cargo/bin/legacy-ndjson-transformer /usr/local/bin/legacy-ndjson-transformer

# Copy the RhyDB binary (used by the API container)
COPY --from=rhydb-downloader /tmp/rhydb /usr/local/bin/rhydb

ENTRYPOINT ["silo-import"]
