#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chart="$repository_root/kubernetes/loculus"

assert_contains() {
    local rendered="$1"
    local expected="$2"
    if [[ "$rendered" != *"$expected"* ]]; then
        echo "Expected rendered configuration to contain: $expected" >&2
        exit 1
    fi
}

assert_not_contains() {
    local rendered="$1"
    local unexpected="$2"
    if [[ "$rendered" == *"$unexpected"* ]]; then
        echo "Expected rendered configuration not to contain: $unexpected" >&2
        exit 1
    fi
}

# Compare complete allowlists, so extra wildcards or localhost entries cannot pass.
assert_redirects() {
    local rendered="$1"
    local redirects="$2"
    local logout_redirects="$3"
    if ! printf '%s\n' "$rendered" \
        | sed -n '/^  keycloak-config.json: |$/,$p' \
        | tail -n +2 \
        | jq -e --argjson redirects "$redirects" --arg logout "$logout_redirects" '
            [.clients[] | select(.clientId == "backend-client")] as $clients
            | ($clients | length) == 1
              and ($clients[0].redirectUris == $redirects)
              and ($clients[0].attributes["post.logout.redirect.uris"] == $logout)
              and ($clients[0].attributes["pkce.code.challenge.method"] == "S256")
        ' >/dev/null; then
        echo "Unexpected browser redirect allowlists or PKCE setting" >&2
        exit 1
    fi
}

production_keycloak="$({
    helm template loculus "$chart" \
        --show-only templates/keycloak-config-map.yaml \
        --set environment=server \
        --set host=production.loculus.org
})"
assert_redirects "$production_keycloak" \
    '["https://production.loculus.org/auth/callback"]' \
    'https://production.loculus.org/logout'

preview_keycloak="$({
    helm template loculus "$chart" \
        -f "$chart/values_preview_server.yaml" \
        --show-only templates/keycloak-config-map.yaml \
        --set environment=server \
        --set host=preview.loculus.org
})"
assert_redirects "$preview_keycloak" \
    '["https://preview.loculus.org/auth/callback", "http://localhost:3000/auth/callback"]' \
    'https://preview.loculus.org/logout##http://localhost:3000/logout'

preview_without_localhost="$({
    helm template loculus "$chart" \
        -f "$chart/values_preview_server.yaml" \
        --show-only templates/keycloak-config-map.yaml \
        --set environment=server \
        --set host=preview.loculus.org \
        --set allowLocalhostAuthRedirects=false
})"
assert_redirects "$preview_without_localhost" \
    '["https://preview.loculus.org/auth/callback"]' \
    'https://preview.loculus.org/logout'

insecure_keycloak="$({
    helm template loculus "$chart" \
        --show-only templates/keycloak-config-map.yaml \
        --set environment=server \
        --set host=preview.loculus.org \
        --set insecureCookies=true
})"
assert_redirects "$insecure_keycloak" \
    '["https://preview.loculus.org/auth/callback", "http://preview.loculus.org/auth/callback"]' \
    'https://preview.loculus.org/logout##http://preview.loculus.org/logout'

local_keycloak="$({
    helm template loculus "$chart" \
        --show-only templates/keycloak-config-map.yaml \
        --set environment=local \
        --set branch=latest \
        --set allowLocalhostAuthRedirects=true
})"
assert_redirects "$local_keycloak" \
    '["http://localhost:3000/auth/callback"]' \
    'http://localhost:3000/logout'
assert_not_contains "$local_keycloak" 'https:///auth/callback'
assert_not_contains "$local_keycloak" 'https:///logout'

dev_keycloak="$({
    helm template loculus "$chart" \
        -f "$chart/values_e2e_and_dev.yaml" \
        --show-only templates/keycloak-config-map.yaml \
        --set environment=local \
        --set branch=latest
})"
# The explicit localhost entries must not duplicate the configured host entries.
assert_redirects "$dev_keycloak" \
    '["https://localhost:3000/auth/callback", "http://localhost:3000/auth/callback"]' \
    'https://localhost:3000/logout##http://localhost:3000/logout'

production_website="$({
    helm template loculus "$chart" \
        --show-only templates/loculus-website-config.yaml \
        --set environment=server \
        --set host=preview.loculus.org
})"
assert_contains "$production_website" '"oidcTransactionCookieSecret" : "[[oidcTransactionCookieSecret]]"'
assert_not_contains "$production_website" '"oidcTransactionCookieSecret" : "test-oidc-transaction-cookie-secret"'

from_live_website="$({
    helm template loculus "$chart" \
        --show-only templates/loculus-website-config.yaml \
        --skip-schema-validation \
        --set disableWebsite=true \
        --set disableBackend=true \
        --set environment=server \
        --set host=preview.loculus.org \
        --set usePublicRuntimeConfigAsServerSide=true
})"
assert_contains "$from_live_website" '"oidcTransactionCookieSecret" : "test-oidc-transaction-cookie-secret"'
assert_not_contains "$from_live_website" '[[oidcTransactionCookieSecret]]'
