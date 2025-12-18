#!/bin/bash
# Generate self-signed certificates for mock ENA server
# These certificates allow the mock to impersonate wwwdev.ebi.ac.uk

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Generating CA certificate..."
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout ca.key -out ca.crt \
  -subj "/CN=Mock ENA CA/O=Loculus Test/C=CH"

echo "Generating server certificate for wwwdev.ebi.ac.uk..."
# Create config file for SAN extension
cat > server.conf << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = wwwdev.ebi.ac.uk
O = Mock ENA
C = CH

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = wwwdev.ebi.ac.uk
DNS.2 = www.ebi.ac.uk
DNS.3 = localhost
IP.1 = 127.0.0.1
EOF

# Generate server key and CSR
openssl req -new -nodes -newkey rsa:2048 \
  -keyout server.key -out server.csr \
  -config server.conf

# Sign the CSR with our CA
openssl x509 -req -days 3650 \
  -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt \
  -extfile server.conf -extensions v3_req

# Cleanup
rm -f server.csr server.conf ca.srl

echo "Certificates generated:"
echo "  CA certificate: ca.crt"
echo "  Server certificate: server.crt"
echo "  Server key: server.key"

# Verify
echo ""
echo "Verifying certificates..."
openssl verify -CAfile ca.crt server.crt
