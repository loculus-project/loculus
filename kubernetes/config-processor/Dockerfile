FROM python:3.10-alpine



WORKDIR /app
COPY . /app

RUN pip install --no-cache-dir -r requirements.txt
LABEL org.opencontainers.image.source https://github.com/loculus-project/argocd_metadata


