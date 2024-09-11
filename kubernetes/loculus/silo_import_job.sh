#!/bin/bash

set -e

input_data_dir="/preprocessing/input"

current_timestamp=$(date +%s)
new_input_data_dir="$input_data_dir/$current_timestamp"

old_input_data_dir="$input_data_dir"/$(ls -1 "$input_data_dir" | sort -n | grep -E '^[0-9]+$' | tail -n 1)

new_input_data="$new_input_data_dir/data.ndjson.zst"
old_input_data="$old_input_data_dir/data.ndjson.zst"
new_input_touchfile="$new_input_data_dir/processing"
old_input_touchfile="$old_input_data_dir/processing"
silo_input_data="$input_data_dir/data.ndjson.zst"

delete_all_input () {
  echo "Deleting all input data"
  rm -f "$silo_input_data"
  rm -rf "$new_input_data_dir"
  echo
}

download_data() {
  mkdir -p "$new_input_data_dir"
  echo  "created $new_input_data_dir"
  
  # Set flag to be cleared when processing succeeds to avoid getting stuck with no output data
  touch "$new_input_touchfile"

  released_data_endpoint="$BACKEND_BASE_URL/get-released-data?compression=zstd"
  echo "calling $released_data_endpoint"
  
  set +e
  curl -o "$new_input_data" --fail-with-body "$released_data_endpoint"
  exit_code=$?
  set -e

  c=`tail -c 2 $new_input_data`
  if [ "$c" != "" ]; then
      echo "No 2 newlines at end of $new_input_data, instead $c, stream not completed, cleaning up and exiting"
      rm -rf "$new_input_data_dir"
      exit $exit_code
  fi

  if [ $exit_code -ne 0 ]; then
    echo "Curl command failed with exit code $exit_code, cleaning up and exiting."
    rm -rf "$new_input_data_dir"
    exit $exit_code
  fi

  echo "downloaded sequences"
  ls -l "$new_input_data_dir"
  echo

  echo "checking for old input data dir $old_input_data_dir"
  if [[ -f "$old_input_data" ]]; then
    if [[ -f "$old_input_touchfile" ]]; then
      echo "Old input data dir was not processed successfully"
      echo "Skipping hash check, deleting old input data dir"
      rm -rf "$old_input_data_dir"
    else
      echo "Old input data dir was processed successfully"
      old_hash=$(md5sum < "$old_input_data" | awk '{print $1}')
      new_hash=$(md5sum < "$new_input_data" | awk '{print $1}')
      echo "old hash: $old_hash"
      echo "new hash: $new_hash"
      if [ "$new_hash" = "$old_hash" ]; then
        echo "Hashes are equal, skipping preprocessing"
        echo "Deleting new input data dir $new_input_data_dir"
        rm -rf "$new_input_data_dir"
        exit 0
      else
        echo "Hashes are unequal, deleting old input data dir"
        rm -rf "$old_input_data_dir:?}"
      fi
    fi
  else
    echo "No old input data dir found"
  fi
  echo
}

preprocessing() {
  echo "Starting preprocessing"

  rm -f "$silo_input_data"

  # This is necessary because the silo preprocessing is configured to expect the input data
  # at /preprocessing/input/data.ndjson.zst
  cp "$new_input_data" "$silo_input_data"
  
  set +e
  time /app/siloApi --preprocessing
  exit_code=$?
  set -e

  if [ $exit_code -ne 0 ]; then
    echo "SiloApi command failed with exit code $exit_code, cleaning up and exiting."
    delete_all_input # Delete input so that we don't skip preprocessing next time due to hash equality
    exit $exit_code
  else
    echo "SiloApi command succeeded"
    echo "Removing touchfile $new_input_touchfile to indicate successful processing"
    rm -f "$new_input_touchfile"
  fi

  echo "preprocessing for $current_timestamp done"
  echo
}

# Potential race condition: silo might not release non-current dir if it's still being used
cleanup_output_data() {
  for dir_type in "input" "output"; do
    dir="/preprocessing/$dir_type"
    echo "Removing all but the most recent $dir_type directory in $dir"
    cd $dir || exit

    if [ -n "$(ls -d -- */ 2>/dev/null)" ]; then
      directories=$(ls -dt -- */)
      dir_num_to_keep=1
      dir_num_to_keep_plus_one=$((dir_num_to_keep + 1))
      if [ "$(echo "$directories" | wc -l)" -gt $dir_num_to_keep ]; then
        dirs_to_keep=$(echo "$directories" | head -n $dir_num_to_keep)
        echo "$directories" | tail -n "+$dir_num_to_keep_plus_one" | xargs rm -r
        echo "Kept: $dirs_to_keep"
      else
        echo "No directories to delete."
      fi
    else
      echo "No directories found."
    fi

    cd - > /dev/null || exit
    echo
  done
}

main() {
  echo "----------------------------------------"
  echo "Script started at: $(date)"

  echo "Current content of input data dir: $input_data_dir"
  ls -l $input_data_dir
  echo "Current content of output data dir: /preprocessing/output"
  ls -l /preprocessing/output
  echo

  # cleanup at start in case we fail later
  cleanup_output_data
  download_data
  preprocessing

  echo "done"
  echo "----------------------------------------"
}

main
