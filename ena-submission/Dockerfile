FROM mambaorg/micromamba:1.5.8

# Install dependencies needed for webin-cli
USER root
RUN apt-get update && apt-get install -y \
    default-jre \
    wget \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /package && chown -R $MAMBA_USER:$MAMBA_USER /package
USER $MAMBA_USER

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml /tmp/env.yaml
COPY --chown=$MAMBA_USER:$MAMBA_USER .mambarc /tmp/.mambarc

RUN micromamba config set extract_threads 1 \
    && micromamba install -y -n base -f /tmp/env.yaml --rc-file /tmp/.mambarc \
    && micromamba clean --all --yes

# Set the environment variable to activate the conda environment
ARG MAMBA_DOCKERFILE_ACTIVATE=1


ENV WEBIN_CLI_VERSION 8.0.0
USER root
RUN wget -q "https://github.com/enasequence/webin-cli/releases/download/${WEBIN_CLI_VERSION}/webin-cli-${WEBIN_CLI_VERSION}.jar" -O /package/webin-cli.jar
USER $MAMBA_USER

COPY --chown=$MAMBA_USER:$MAMBA_USER . /package
WORKDIR /package