#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chart="$repository_root/kubernetes/loculus"

assert_issuer() {
    local expected="$1"
    shift
    local rendered
    rendered=$(helm template loculus "$chart" \
        --show-only templates/loculus-backend.yaml \
        --show-only templates/keycloak-deployment.yaml \
        --show-only templates/keycloak-config-map.yaml "$@")
    local actual
    actual=$(printf '%s\n' "$rendered" | sed -n 's/.*--spring.security.oauth2.resourceserver.jwt.issuer-uri=\([^"]*\)".*/\1/p')
    if [[ "$actual" != "$expected" ]]; then
        echo "Expected issuer $expected; got $actual" >&2
        exit 1
    fi
    local hostname_url frontend_url
    hostname_url=$(printf '%s\n' "$rendered" | sed -n '/name: KC_HOSTNAME_URL/{n;s/.*value: "\([^"]*\)".*/\1/p;}')
    frontend_url=$(printf '%s\n' "$rendered" | sed -n 's/.*"frontendUrl": "\([^"]*\)".*/\1/p')
    # Check rendered Keycloak configuration, not a live token; Keycloak appends the realm path.
    # Remove a trailing slash before joining the base URL and realm path.
    if [[ -z "$hostname_url" || "${hostname_url%/}/realms/loculus" != "$actual" ]]; then
        echo "Keycloak KC_HOSTNAME_URL '$hostname_url' does not match backend issuer '$actual'" >&2
        exit 1
    fi
    if [[ -z "$frontend_url" || "${frontend_url%/}/realms/loculus" != "$actual" ]]; then
        echo "Keycloak realm frontendUrl '$frontend_url' does not match backend issuer '$actual'" >&2
        exit 1
    fi
    if [[ "$rendered" != *'--spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://loculus-keycloak-service:8083/realms/loculus/protocol/openid-connect/certs'* ]]; then
        echo "Internal JWKS URL changed unexpectedly" >&2
        exit 1
    fi
}

assert_issuer 'https://authentication-main.loculus.org/realms/loculus' \
    --set environment=server --set host=main.loculus.org
assert_issuer 'https://authentication.pathoplexus.org/realms/loculus' \
    --set environment=server --set host=pathoplexus.org --set subdomainSeparator=.
assert_issuer 'https://authentication-preview.loculus.org/realms/loculus' \
    -f "$chart/values_preview_server.yaml" --set environment=server --set host=preview.loculus.org
assert_issuer 'http://localhost:8083/realms/loculus' \
    -f "$chart/values_e2e_and_dev.yaml" --set environment=local --set branch=latest
assert_issuer 'http://192.0.2.1:8083/realms/loculus' \
    --set environment=local --set localHost=192.0.2.1 --set branch=latest
assert_issuer 'https://example-8083.app.github.dev/realms/loculus' \
    --set environment=local --set public.keycloakUrl=https://example-8083.app.github.dev --set branch=latest
assert_issuer 'https://identity.example.org/auth/realms/loculus' \
    --set environment=server --set host=example.org --set public.keycloakUrl=https://identity.example.org/auth/

echo "Backend issuer configuration checks passed."
