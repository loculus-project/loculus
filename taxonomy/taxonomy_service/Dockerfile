FROM mambaorg/micromamba:2.3.3-ubuntu24.04

WORKDIR /opt/app

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gzip \
 && rm -rf /var/lib/apt/lists/*

RUN curl -L https://loculus-public.hel1.your-objectstorage.com/taxonomy/ncbi_taxonomy_latest.sqlite.gz -o ncbi_taxonomy_latest.sqlite.gz\
 && gunzip ncbi_taxonomy_latest.sqlite.gz \
 && chown $MAMBA_USER:$MAMBA_USER ncbi_taxonomy_latest.sqlite
USER $MAMBA_USER

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yaml .mambarc ./
RUN micromamba config set extract_threads 1 \
 && micromamba install --yes --name base -f environment.yaml --rc-file .mambarc \
 && micromamba clean --all --yes

ARG MAMBA_DOCKERFILE_ACTIVATE=1

COPY --chown=$MAMBA_USER:$MAMBA_USER . .
RUN uv pip install --system --no-cache .
# in the kubernetes deployment, the config file gets mounted at /config/config.yaml
CMD ["taxonomy_service", "--config-file=/config/config.yaml"]
