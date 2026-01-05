# --- Rust builder stage ---
FROM rust:1.92-slim AS rust-builder

WORKDIR /build

ARG REPO=https://github.com/GenSpectrum/LAPIS-SILO.git
ARG COMMIT=0679453f5cbd20a813cd964e8600c40aad9165af

# Install the binary into /usr/local/cargo/bin
RUN cargo install --git $REPO --rev $COMMIT

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
COPY --from=rust-builder /usr/local/cargo/bin/legacy-ndjson-transformer /usr/local/bin/legacy-ndjson-transformer

ENTRYPOINT ["silo-import"]