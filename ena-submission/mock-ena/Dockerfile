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

# Generate certificates at build time and create cert chain
RUN chmod +x certs/generate-certs.sh && certs/generate-certs.sh && \
    cat certs/server.crt certs/ca.crt > certs/chain.crt

# Create directory for SQLite database and FTP uploads
RUN mkdir -p /data /ftp-uploads

# Make startup script executable
RUN chmod +x /app/start.sh

# Expose HTTP, HTTPS, and FTP ports
EXPOSE 80 443 21 60000-60100

# Run all servers
CMD ["/app/start.sh"]
