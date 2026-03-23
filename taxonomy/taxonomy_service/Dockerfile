FROM mambaorg/micromamba:2.3.3-ubuntu24.04

WORKDIR /opt/app

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gzip \
 && rm -rf /var/lib/apt/lists/*

COPY --chown=$MAMBA_USER:$MAMBA_USER ncbi_taxonomy_digest.sha256 .

ARG CURRENT_DB_VERSION=ncbi_taxonomy_2026-03-23

RUN curl -L https://loculus-public.hel1.your-objectstorage.com/taxonomy/${CURRENT_DB_VERSION}.sqlite.gz -o tmp.sqlite.gz \
 && sha256sum --check ncbi_taxonomy_digest.sha256 \
 && mv tmp.sqlite.gz ${CURRENT_DB_VERSION}.sqlite.gz \
 && gunzip ${CURRENT_DB_VERSION}.sqlite.gz \
 && chown $MAMBA_USER:$MAMBA_USER ${CURRENT_DB_VERSION}.sqlite

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
