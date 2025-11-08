# Stage 1: Build dependencies for SILO
FROM ubuntu:24.04 AS dependency-builder

ARG TARGETPLATFORM

RUN apt update && apt dist-upgrade -y \
    && apt install -y \
    build-essential cmake python3 pipx software-properties-common wget gnupg lsb-release jq curl \
    && wget -qO- https://apt.llvm.org/llvm-snapshot.gpg.key | tee /etc/apt/trusted.gpg.d/apt.llvm.org.asc \
    && add-apt-repository 'deb http://apt.llvm.org/jammy/  llvm-toolchain-jammy-20 main' \
    && apt install -y clang-tidy-20

# Setup pipx and conan
RUN python3 -m pipx ensurepath
SHELL ["/bin/bash", "-login", "-c"]
RUN python3 -m pipx install conan==2.16.1

WORKDIR /src
COPY LAPIS-SILO/conanfile.py LAPIS-SILO/conanprofile.docker LAPIS-SILO/conanprofile.docker_arm ./
RUN if [ "$TARGETPLATFORM" = "linux/arm64" ]; then \
        mv conanprofile.docker_arm conanprofile; \
    else \
        mv conanprofile.docker conanprofile; \
    fi

RUN conan install . --build=missing --profile ./conanprofile --profile:build ./conanprofile --output-folder=build/Release/generators

# Stage 2: Build SILO from submodule
FROM dependency-builder AS silo-builder

WORKDIR /src
COPY LAPIS-SILO ./
COPY fix-acero-library-name.patch ./

# Apply fix for Arrow Acero library name (backport from later SILO versions)
RUN patch -p1 < fix-acero-library-name.patch

RUN python3 ./build_with_conan.py --release --parallel 4

# Stage 3: Create final image with Python package and SILO binary
FROM ubuntu:24.04

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install Python 3.11 and runtime dependencies
RUN apt update && apt dist-upgrade -y \
    && apt install -y python3 python3-pip python3-venv curl jq \
    && rm -rf /var/lib/apt/lists/*

# Copy SILO binary from builder
COPY --from=silo-builder /src/build/Release/silo /usr/local/bin/silo

# Copy and install Python package
COPY pyproject.toml README.md /app/
COPY src /app/src

RUN pip3 install --no-cache-dir --upgrade pip --break-system-packages \
    && pip3 install --no-cache-dir . --break-system-packages

ENTRYPOINT ["silo-import"]
