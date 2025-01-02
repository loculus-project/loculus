FROM mambaorg/micromamba:1.5.8

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yaml /tmp/env.yaml

RUN micromamba config set extract_threads 1 \
    && micromamba install -y -n base -f /tmp/env.yaml \
    && micromamba clean --all --yes

# Set the environment variable to activate the conda environment
ARG MAMBA_DOCKERFILE_ACTIVATE=1

COPY --chown=$MAMBA_USER:$MAMBA_USER . /package

RUN mkdir -p /package/uploads
RUN mkdir -p /package/results

WORKDIR /package
ENV PATH="/opt/conda/bin:$PATH"

EXPOSE 5000

ENTRYPOINT ["/bin/bash", "-c"]
CMD ["sh"]