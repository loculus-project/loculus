#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chart="$repository_root/kubernetes/loculus"

public="$(helm template loculus "$chart" --show-only templates/keycloak-config-map.yaml)"
[[ "$public" == *'"registrationAllowed": true'* ]]
[[ "$public" == *'"accessTokenLifespan": 36000'* ]]

restricted="$(helm template loculus "$chart" --set requireLogin=true --set s3.enabled=false)"
[[ "$restricted" == *'"registrationAllowed": false'* ]]
[[ "$restricted" == *'"accessTokenLifespan": 300'* ]]
[[ "$restricted" == *'"name": "contributor"'* ]]
[[ "$restricted" == *'"name": "ingestion_pipeline"'* ]]
[[ "$restricted" == *'--loculus.require-authentication=true'* ]]
[[ "$restricted" != *'name: lapis-ingress'* ]]
[[ "$restricted" != *'name: lapis-redirect-ingress'* ]]
[[ "$restricted" == *'name: KEYCLOAK_TOKEN_URL'* ]]
[[ "$restricted" != *'create_embl_file: true'* ]]
[[ "$restricted" == *'create_embl_file: false'* ]]
[[ "$restricted" != *'"username": "testcontributor"'* ]]
test_accounts="$(helm template loculus "$chart" --set createTestAccounts=true --show-only templates/keycloak-config-map.yaml)"
[[ "$test_accounts" == *'"username": "testcontributor"'* ]]
[[ "$test_accounts" == *'"realmRoles": ["user", "contributor", "offline_access"]'* ]]

for setting in s3.enabled=true auth.registrationAllowed=true disableWebsite=true disableBackend=true readOnlyMode=true disableEnaSubmission=false public.lapisUrlTemplate=https://example.test; do
    if helm template loculus "$chart" --set requireLogin=true --set s3.enabled=false --set "$setting" >/dev/null 2>&1; then
        echo "Expected restricted configuration to reject $setting" >&2
        exit 1
    fi
done

echo "Restricted access configuration checks passed"
