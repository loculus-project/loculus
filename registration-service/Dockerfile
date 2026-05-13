FROM python:3.12-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends musl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=lldap/lldap:v0.6.1 /app/lldap_set_password /usr/local/bin/lldap_set_password
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
COPY templates ./templates
COPY static ./static
EXPOSE 8090
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8090"]
