FROM mambaorg/micromamba:1.5.8

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yaml /tmp/env.yaml

RUN micromamba config set extract_threads 1 \
    && micromamba install -y -n base -f /tmp/env.yaml \
    && micromamba clean --all --yes

# Set the environment variable to activate the conda environment
ARG MAMBA_DOCKERFILE_ACTIVATE=1

COPY --chown=$MAMBA_USER:$MAMBA_USER . /package

WORKDIR /package

EXPOSE 5000