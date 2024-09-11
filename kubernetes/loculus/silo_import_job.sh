#!/bin/bash

set -e

lastSnapshot=""

# Parse command-line arguments
usage() {
  echo "Usage: $0 [--lastSnapshot=UNIXTIMESTAMP]" >&2
  exit 1
}

for arg in "$@"; do
  case $arg in
    --lastSnapshot=*)
      lastSnapshot="${arg#*=}"
      shift
      ;;
    *)
      usage
      ;;
  esac
done

input_data_dir="/preprocessing/input"

current_timestamp=$(date +%s)
new_input_data_dir="$input_data_dir/$current_timestamp"

old_input_data_dir="$input_data_dir"/$(ls -1 "$input_data_dir" | sort -n | grep -E '^[0-9]+$' | tail -n 1)

new_input_data="$new_input_data_dir/data.ndjson.zst"
new_input_header="$new_input_data_dir/header.txt"
old_input_data="$old_input_data_dir/data.ndjson.zst"
new_input_touchfile="$new_input_data_dir/processing"
old_input_touchfile="$old_input_data_dir/processing"
silo_input_data="$input_data_dir/data.ndjson.zst"

delete_all_input () {
  echo "Deleting all input data" >&2
  rm -f "$silo_input_data"
  rm -rf "$new_input_data_dir" >&2
  echo
}

download_data() {
  mkdir -p "$new_input_data_dir"
  echo  "created $new_input_data_dir" >&2
  
  # Set flag to be cleared when processing succeeds to avoid getting stuck with no output data
  touch "$new_input_touchfile"

  released_data_endpoint="$BACKEND_BASE_URL/get-released-data?compression=zstd"
  echo "calling $released_data_endpoint" >&2
  
  set +e
  curl -o "$new_input_data" --fail-with-body "$released_data_endpoint"  -H "If-Modified-Since: $lastSnapshot" -D "$new_input_header" -w "%{http_code}"
  exit_code=$?
  set -e

  http_code="${response: -3}"

  if [ "$http_code" -eq 304 ]; then
    echo "State in Loculus backend has not changed: HTTP 304 Not Modified." >&2
    rm -rf "$new_input_data_dir"
    echo "$lastSnapshot"
    exit 0
  if [ $exit_code -ne 0 ]; then
    echo "Curl command failed with exit code $exit_code, cleaning up and exiting." >&2
    rm -rf "$new_input_data_dir"
    echo "$lastSnapshot"
    exit $exit_code
  fi
  
  last_modified=$(grep '^last-modified:' "$new_input_header" | awk '{print $2}')
  echo "$last_modified"

  echo "downloaded sequences" >&2
  ls -l "$new_input_data_dir"
  echo >&2

  echo "checking for old input data dir $old_input_data_dir" >&2
  if [[ -f "$old_input_data" ]]; then
    if [[ -f "$old_input_touchfile" ]]; then
      echo "Old input data dir was not processed successfully" >&2
      echo "Skipping hash check, deleting old input data dir" >&2
      rm -rf "$old_input_data_dir"
    else
      echo "Old input data dir was processed successfully" >&2
      old_hash=$(md5sum < "$old_input_data" | awk '{print $1}')
      new_hash=$(md5sum < "$new_input_data" | awk '{print $1}')
      echo "old hash: $old_hash" >&2
      echo "new hash: $new_hash" >&2
      if [ "$new_hash" = "$old_hash" ]; then
        echo "Hashes are equal, skipping preprocessing" >&2
        echo "Deleting new input data dir $new_input_data_dir" >&2
        rm -rf "$new_input_data_dir"
        echo "$lastSnapshot"
        exit 0
      else
        echo "Hashes are unequal, deleting old input data dir" >&2
        rm -rf "$old_input_data_dir:?}"
      fi
    fi
  else
    echo "No old input data dir found" >&2
  fi
  echo >&2
}

preprocessing() {
  echo "Starting preprocessing" >&2

  rm -f "$silo_input_data"

  # This is necessary because the silo preprocessing is configured to expect the input data
  # at /preprocessing/input/data.ndjson.zst
  cp "$new_input_data" "$silo_input_data"
  
  set +e
  time /app/siloApi --preprocessing
  exit_code=$?
  set -e

  if [ $exit_code -ne 0 ]; then
    echo "SiloApi command failed with exit code $exit_code, cleaning up and exiting." >&2
    delete_all_input # Delete input so that we don't skip preprocessing next time due to hash equality
    exit $exit_code
  else
    echo "SiloApi command succeeded" >&2
    echo "Removing touchfile $new_input_touchfile to indicate successful processing" >&2
    rm -f "$new_input_touchfile"
  fi

  echo "preprocessing for $current_timestamp done" >&2
  echo >&2
}

# Potential race condition: silo might not release non-current dir if it's still being used
cleanup_output_data() {
  for dir_type in "input" "output"; do
    dir="/preprocessing/$dir_type"
    echo "Removing all but the most recent $dir_type directory in $dir" >&2
    cd $dir || { echo "$lastSnapshot"; exit 1; }

    if [ -n "$(ls -d -- */ 2>/dev/null)" ]; then
      directories=$(ls -dt -- */)
      dir_num_to_keep=1
      dir_num_to_keep_plus_one=$((dir_num_to_keep + 1))
      if [ "$(echo "$directories" | wc -l)" -gt $dir_num_to_keep ]; then
        dirs_to_keep=$(echo "$directories" | head -n $dir_num_to_keep)
        echo "$directories" | tail -n "+$dir_num_to_keep_plus_one" | xargs rm -r >&2
        echo "Kept: $dirs_to_keep" >&2
      else
        echo "No directories to delete." >&2
      fi
    else
      echo "No directories found." >&2
    fi

    cd - > /dev/null || { echo "$lastSnapshot"; exit 1; }
    echo >&2
  done
}

main() {
  echo "----------------------------------------" >&2
  echo "Script started at: $(date)" >&2

  echo "Current content of input data dir: $input_data_dir" >&2
  ls -l $input_data_dir
  echo "Current content of output data dir: /preprocessing/output" >&2
  ls -l /preprocessing/output
  echo >&2

  # cleanup at start in case we fail later
  cleanup_output_data
  last_modified=$(download_data)
  preprocessing
  echo "$last_modified"

  echo "done" >&2
  echo "----------------------------------------" >&2
}

main
