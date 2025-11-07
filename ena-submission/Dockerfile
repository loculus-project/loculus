FROM mambaorg/micromamba:2.3.3-ubuntu24.04

WORKDIR /opt/app

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml .mambarc ./
RUN micromamba config set extract_threads 1 \
 && micromamba install --yes --name base -f environment.yml --rc-file .mambarc \
 && micromamba clean --all --yes

ARG MAMBA_DOCKERFILE_ACTIVATE=1

COPY --chown=$MAMBA_USER:$MAMBA_USER . .
RUN uv pip install --system --no-cache .
