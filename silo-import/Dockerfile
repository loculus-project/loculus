# Stage 1: Build SILO from submodule
ARG DEPENDENCY_IMAGE=ghcr.io/genspectrum/lapis-silo-dependencies:latest

FROM $DEPENDENCY_IMAGE AS silo-builder

WORKDIR /src
COPY LAPIS-SILO ./

RUN python3 ./build_with_conan.py --release --parallel 4

# Stage 2: Create final image with Python package and SILO binary
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install runtime dependencies
RUN apt-get update \
    && apt-get install -y curl jq \
    && rm -rf /var/lib/apt/lists/*

# Copy SILO binary from builder
COPY --from=silo-builder /src/build/Release/silo /usr/local/bin/silo

# Copy and install Python package
COPY pyproject.toml README.md /app/
COPY src /app/src

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir .

ENTRYPOINT ["silo-import"]
