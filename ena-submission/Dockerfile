# Stage 1: Base image with micromamba
FROM mambaorg/micromamba:1.5.8 AS base

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml /tmp/env.yaml
COPY --chown=$MAMBA_USER:$MAMBA_USER .mambarc /tmp/.mambarc

RUN micromamba config set extract_threads 1 \
    && micromamba install -y -n base -f /tmp/env.yaml --rc-file /tmp/.mambarc \
    && micromamba clean --all --yes

# Set the environment variable to activate the conda environment
ARG MAMBA_DOCKERFILE_ACTIVATE=1

COPY --chown=$MAMBA_USER:$MAMBA_USER . /package

WORKDIR /package

# Stage 2: Flyway image for database migrations
FROM flyway/flyway:latest AS flyway

# Copy Flyway configuration and SQL scripts from the base image
COPY --from=base /package/flyway/conf /flyway/conf
COPY --from=base /package/flyway/sql /flyway/sql

# Stage 3: Final image combining both base and flyway capabilities
FROM mambaorg/micromamba:1.5.8

# Install Java
RUN apt-get update && apt-get install -y openjdk-11-jre-headless && rm -rf /var/lib/apt/lists/*

# Copy the base stage content
COPY --from=base /usr/local /usr/local
COPY --from=base /opt/conda /opt/conda
COPY --from=base /package /package

# Copy Flyway binaries
COPY --from=flyway /flyway /flyway

# Set the environment variable to activate the conda environment
ARG MAMBA_DOCKERFILE_ACTIVATE=1

# Ensure Flyway is in the PATH
ENV PATH="/flyway:${PATH}"

WORKDIR /package

# ENTRYPOINT or CMD to allow custom commands
CMD ["/bin/bash"]