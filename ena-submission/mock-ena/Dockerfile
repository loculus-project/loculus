FROM python:3.12-slim

WORKDIR /app

# Install openssl for certificate generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Generate certificates at build time
RUN chmod +x certs/generate-certs.sh && certs/generate-certs.sh

# Create directory for SQLite database
RUN mkdir -p /data

# Expose both HTTP and HTTPS ports
EXPOSE 80 443

# Default to HTTP for internal cluster use
# Override with MOCK_ENA_USE_HTTPS=true for HTTPS
CMD ["sh", "-c", "if [ \"$MOCK_ENA_USE_HTTPS\" = 'true' ]; then uvicorn server:app --host 0.0.0.0 --port 443 --ssl-keyfile certs/server.key --ssl-certfile certs/server.crt; else uvicorn server:app --host 0.0.0.0 --port 80; fi"]
