#!/bin/bash
# Setup script for mock ENA environment
# This script is called when MOCK_ENA_URL is set to configure DNS and CA certificates

set -e

if [ -z "$MOCK_ENA_URL" ]; then
    echo "MOCK_ENA_URL not set, skipping mock ENA setup"
    exit 0
fi

echo "Setting up mock ENA environment..."

# Extract hostname from MOCK_ENA_URL (e.g., http://mock-ena-service -> mock-ena-service)
MOCK_HOST=$(echo "$MOCK_ENA_URL" | sed -E 's|https?://([^:/]+).*|\1|')
echo "Mock ENA host: $MOCK_HOST"

# Resolve the mock service IP
echo "Resolving $MOCK_HOST..."
MOCK_IP=$(getent hosts "$MOCK_HOST" | awk '{ print $1 }' | head -1)

if [ -z "$MOCK_IP" ]; then
    echo "ERROR: Could not resolve $MOCK_HOST"
    exit 1
fi

echo "Mock ENA IP: $MOCK_IP"

# Add hosts entries for ENA domains
echo "Adding hosts entries..."
echo "$MOCK_IP wwwdev.ebi.ac.uk" >> /etc/hosts
echo "$MOCK_IP www.ebi.ac.uk" >> /etc/hosts

# If CA cert file is provided, set up SSL trust
if [ -n "$MOCK_ENA_CA_CERT" ] && [ -f "$MOCK_ENA_CA_CERT" ]; then
    echo "Setting up CA certificate from $MOCK_ENA_CA_CERT"

    # For Python requests library
    export REQUESTS_CA_BUNDLE="$MOCK_ENA_CA_CERT"
    export SSL_CERT_FILE="$MOCK_ENA_CA_CERT"

    # For Java (webin-cli) - find Java cacerts and import the CA
    if command -v keytool &> /dev/null; then
        JAVA_CACERTS=$(find /usr -name "cacerts" -type f 2>/dev/null | head -1)
        if [ -n "$JAVA_CACERTS" ]; then
            echo "Importing CA cert into Java cacerts: $JAVA_CACERTS"
            keytool -import -trustcacerts -keystore "$JAVA_CACERTS" \
                -storepass changeit -noprompt -alias mock-ena-ca \
                -file "$MOCK_ENA_CA_CERT" 2>/dev/null || true
        fi
    fi
fi

echo "Mock ENA setup complete"

# Verify connectivity
echo "Testing mock ENA connectivity..."
if curl -sf --max-time 5 "${MOCK_ENA_URL}/" > /dev/null 2>&1; then
    echo "Mock ENA is reachable at $MOCK_ENA_URL"
else
    echo "WARNING: Could not connect to mock ENA at $MOCK_ENA_URL"
fi
