FROM mambaorg/micromamba:2.3.3-ubuntu24.04

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml /tmp/env.yaml
COPY --chown=$MAMBA_USER:$MAMBA_USER .mambarc /tmp/.mambarc

RUN micromamba config set extract_threads 1 \
    && micromamba install -y -n base -f /tmp/env.yaml --rc-file /tmp/.mambarc \
    && micromamba clean --all --yes

COPY --chown=$MAMBA_USER:$MAMBA_USER . /package

# Set the environment variable to activate the conda environment
ARG MAMBA_DOCKERFILE_ACTIVATE=1

RUN ls -alht /package

RUN uv pip install --system --no-cache /package
