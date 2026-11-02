#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: $0 (--dry-run | --apply) [--report PATH]"
}

# Do not inspect credentials, start Java or connect anywhere without an explicit valid mode.
if [[ $# -eq 0 || ( $# -eq 1 && $1 == --help ) ]]; then
    usage
    exit 0
fi
if [[ ( $1 != --dry-run && $1 != --apply ) || ( $# -ne 1 && $# -ne 3 ) ]]; then
    usage >&2
    exit 1
fi
if [[ $# -eq 3 && ( $2 != --report || -z $3 || $3 == --* ) ]]; then
    usage >&2
    exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backfill_jar="${LOCULUS_BACKEND_JAR:-$script_dir/../../backend/build/libs/backend.jar}"
if [[ ! -f "$backfill_jar" ]]; then
    echo "Build backend: ./gradlew bootJar, or set LOCULUS_BACKEND_JAR to the deployed backend jar." >&2
    exit 1
fi
java_bin="${JAVA_HOME:+$JAVA_HOME/bin/}java"
exec "$java_bin" -Dloader.main=org.loculus.backend.maintenance.IdentityBackfillCommand \
    -cp "$backfill_jar" org.springframework.boot.loader.launch.PropertiesLauncher "$@"
