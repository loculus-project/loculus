#!/bin/sh
set -eu

log() {
  echo "$(date '+%Y-%m-%dT%H:%M:%S%z') [silo-runner] $*"
}

INPUT_DIR="/preprocessing/input"
RUN_FILE="$INPUT_DIR/run_silo"
DONE_FILE="$INPUT_DIR/silo_done"
SLEEP_SECONDS="${SILO_RUNNER_SLEEP_SECONDS:-1}"
PATH_TO_SILO_BINARY="${PATH_TO_SILO_BINARY:-/app/silo}"

say_completion() {
  run_id="$1"
  status="$2"
  message="$3"
  {
    printf 'run_id=%s\n' "$run_id"
    printf 'status=%s\n' "$status"
    if [ -n "$message" ]; then
      printf 'message=%s\n' "$message"
    fi
  } >"$DONE_FILE"
}

while true; do
  if [ -f "$RUN_FILE" ]; then
    run_id=$(grep '^run_id=' "$RUN_FILE" | head -n 1 | cut -d'=' -f2-)
    if [ -z "$run_id" ]; then
      log "Found run sentinel without run_id; sleeping"
      sleep "$SLEEP_SECONDS"
      continue
    fi

    rm -f "$RUN_FILE"
    log "Starting SILO preprocessing for run $run_id"

    if "$PATH_TO_SILO_BINARY" preprocessing; then
      log "SILO preprocessing completed for run $run_id"
      say_completion "$run_id" "success" ""
    else
      exit_code=$?
      log "SILO preprocessing failed for run $run_id (exit $exit_code)"
      say_completion "$run_id" "error" "SILO exited with code $exit_code"
      exit "$exit_code"
    fi
  else
    sleep "$SLEEP_SECONDS"
  fi
done
