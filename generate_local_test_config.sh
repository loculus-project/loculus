#!/bin/bash

set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
helmChart="$root"/kubernetes/preview

helm template name-does-not-matter "$helmChart" --show-only templates/pathoplexus-backend-config.yaml | \
  awk '/backend_config.json: \|/{getline; print; exit}' - \
  > "$root"/website/tests/config/backend_config.json

helm template name-does-not-matter "$helmChart" --show-only templates/pathoplexus-website-config.yaml | \
  awk '/website_config.json: \|/{getline; print; exit}' - \
  > "$root"/website/tests/config/website_config.json
