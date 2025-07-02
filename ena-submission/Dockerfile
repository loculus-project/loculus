FROM mambaorg/micromamba:2.3.0

WORKDIR /opt/app

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml .mambarc ./
RUN micromamba config set extract_threads 1 \
 && micromamba install --yes --name base -f environment.yml --rc-file .mambarc \
 && micromamba clean --all --yes

COPY --chown=$MAMBA_USER:$MAMBA_USER . .
RUN micromamba run pip install --no-cache-dir .
