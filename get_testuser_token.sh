#!/usr/bin/bash
set -eu

KEYCLOAK_TOKEN_URL="http://localhost:8083/realms/loculus/protocol/openid-connect/token"
KEYCLOAK_CLIENT_ID="test-cli"

usernameAndPassword="${1:-testuser}"

echo "Retrieving JWT from $KEYCLOAK_TOKEN_URL for user $usernameAndPassword"
jwt_keycloak=$(curl -X POST "$KEYCLOAK_TOKEN_URL" --fail-with-body -H 'Content-Type: application/x-www-form-urlencoded' -d "username=$usernameAndPassword&password=$usernameAndPassword&grant_type=password&client_id=$KEYCLOAK_CLIENT_ID")
jwt=$(echo "$jwt_keycloak" | jq -r '.access_token')

if [ -z "$jwt" ]; then
  echo "Failed to retrieve JWT"
  exit 1
fi
echo "JWT retrieved successfully:"
echo
echo "$jwt"
