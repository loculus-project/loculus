# --- Rust builder stage ---
FROM rust:1.92-slim AS rust-builder

WORKDIR /build

ARG REPO=https://github.com/GenSpectrum/LAPIS-SILO.git
ARG COMMIT=8d38b2739524cca52857d9d09ff05e9373cea4df

# Install the binary into /usr/local/cargo/bin
RUN cargo install --git $REPO --rev $COMMIT

# --- SILO binary download stage ---
FROM curlimages/curl:8.12.1 AS silo-downloader

ARG SILO_BINARY_URL=https://silo-benchmarks.genspectrum.org/release_downloads/silo-current.gz

RUN curl -sL "$SILO_BINARY_URL" | gunzip > /tmp/silo && chmod +x /tmp/silo

# --- Python runtime stage ---
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY pyproject.toml README.md /app/
COPY src /app/src

RUN pip install --no-cache-dir --upgrade pip \
    && apt-get update \
    && apt-get install -y --no-install-recommends zstd \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir .

# Copy the compiled Rust binary into PATH
COPY --from=rust-builder /usr/local/cargo/bin/legacy-ndjson-transformer /usr/local/bin/legacy-ndjson-transformer

# Copy the SILO binary
COPY --from=silo-downloader /tmp/silo /usr/local/bin/silo

ENTRYPOINT ["silo-import"]
