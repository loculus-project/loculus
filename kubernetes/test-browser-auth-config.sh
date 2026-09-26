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

production_keycloak="$({
    helm template loculus "$chart" \
        --show-only templates/keycloak-config-map.yaml \
        --set environment=server \
        --set host=preview.loculus.org
})"
assert_contains "$production_keycloak" '"https://preview.loculus.org/auth/callback"'
assert_contains "$production_keycloak" '"http://localhost:3000/auth/callback"'
assert_contains "$production_keycloak" '"post.logout.redirect.uris": "https://preview.loculus.org/logout##http://localhost:3000/logout"'
assert_not_contains "$production_keycloak" '"http://preview.loculus.org/auth/callback"'

insecure_keycloak="$({
    helm template loculus "$chart" \
        --show-only templates/keycloak-config-map.yaml \
        --set environment=server \
        --set host=preview.loculus.org \
        --set insecureCookies=true
})"
assert_contains "$insecure_keycloak" '"http://preview.loculus.org/auth/callback"'
assert_contains "$insecure_keycloak" 'http://preview.loculus.org/logout'

local_keycloak="$({
    helm template loculus "$chart" \
        --show-only templates/keycloak-config-map.yaml \
        --set environment=local \
        --set branch=latest
})"
assert_contains "$local_keycloak" '"http://localhost:3000/auth/callback"'
assert_contains "$local_keycloak" '"post.logout.redirect.uris": "http://localhost:3000/logout"'
assert_not_contains "$local_keycloak" 'https:///auth/callback'
assert_not_contains "$local_keycloak" 'https:///logout'

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
