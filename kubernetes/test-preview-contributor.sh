#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chart="$root/kubernetes/loculus"
public="$(helm template loculus "$chart")"
[[ "$public" != *'name: loculus-preview-contributor'* ]]
preview="$(helm template loculus "$chart" -f "$chart/values_preview_server.yaml" --show-only templates/preview-contributor.yaml)"
[[ "$preview" == *'argocd.argoproj.io/hook: PostSync'* ]]
[[ "$preview" == *'activeDeadlineSeconds: 1800'* ]]
[[ "$preview" == *'automountServiceAccountToken: false'* ]]
[[ "$preview" == *'value: "Contributor Preview Testing"'* ]]
for override in createTestAccounts=false runDevelopmentMainDatabase=false runDevelopmentKeycloakDatabase=false disableIngest=true ingest.groupId=2; do
    if helm template loculus "$chart" -f "$chart/values_preview_server.yaml" --set "$override" >/dev/null 2>&1; then
        echo "Expected fixture guard failure for $override" >&2
        exit 1
    fi
done
python3 -m unittest discover -s "$root/kubernetes" -p test_preview_contributor.py
echo "Preview contributor fixture checks passed"
