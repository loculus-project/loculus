#!/bin/bash

set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
helmChart="$root"/kubernetes/preview

backend_config="$root"/website/tests/config/backend_config.json
helm template name-does-not-matter "$helmChart" --show-only templates/pathoplexus-backend-config.yaml | \
  awk '/backend_config.json: \|/{getline; print; exit}' - \
  > "$backend_config"
echo "wrote backend config to $backend_config"

website_config="$root"/website/tests/config/website_config.json
helm template name-does-not-matter "$helmChart" --show-only templates/pathoplexus-website-config.yaml | \
  awk '/website_config.json: \|/{getline; print; exit}' - \
  > "$website_config"
echo "wrote website config to $website_config"
