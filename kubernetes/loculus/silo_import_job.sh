#!/bin/bash
set -e

# Default values
root_dir=""
last_etag=""
lineage_definition_file=/preprocessing/input/lineage_definitions.yaml
preprocessing_config_file=preprocessing_config.yaml
preprocessing_config_file_merged=preprocessing_config_merged.yaml

# Parse command-line arguments
usage() {
  echo "Usage: $0 [--root-dir=PATH] [--last-etag=UNIXTIMESTAMP] [--backend-base-url=BACKEND_BASE_URL]"
  exit 1
}

for arg in "$@"; do
  case $arg in
    --root-dir=*)
      root_dir="${arg#*=}"
      shift
      ;;
    --last-etag=*)
      last_etag="${arg#*=}"
      shift
      ;;
    --backend-base-url=*)
      backend_base_url="${arg#*=}"
      shift
      ;;
    *)
      usage
      ;;
  esac
done

# Check if backend base URL is provided
if [ -z "$backend_base_url" ]; then
  echo "Error: Missing mandatory argument --backend-base-url"
  usage
fi

echo ""
echo "-----------START OF NEW RUN---------------------"


preprocessing_dir="${root_dir}/preprocessing"

input_data_dir="${preprocessing_dir}/input"
output_data_dir="${preprocessing_dir}/output"

mkdir -p "$input_data_dir"
mkdir -p "$output_data_dir"

current_timestamp=$(date +%s)
new_input_data_dir="$input_data_dir/$current_timestamp"

old_input_data_dir="$input_data_dir"/$(ls -1 "$input_data_dir" | sort -n | grep -E '^[0-9]+$' | tail -n 1)

new_input_data_path="$new_input_data_dir/data.ndjson.zst"
new_input_header_path="$new_input_data_dir/header.txt"
new_etag_path="$new_input_data_dir/etag.txt"
current_etag_path="$input_data_dir/etag.txt"

old_input_data_path="$old_input_data_dir/data.ndjson.zst"
new_input_touchfile="$new_input_data_dir/processing"
old_input_touchfile="$old_input_data_dir/processing"
silo_input_data_path="$input_data_dir/data.ndjson.zst"

delete_all_input () {
  echo "Deleting all input data"
  rm -f "$silo_input_data_path"
  rm -rf "$new_input_data_dir"
  echo
}

download_data() {
  mkdir -p "$new_input_data_dir"
  echo  "created $new_input_data_dir"
  
  # Set flag to be cleared when processing succeeds to avoid getting stuck with no output data
  touch "$new_input_touchfile"

  released_data_endpoint="$backend_base_url/get-released-data?compression=zstd"
  echo "calling $released_data_endpoint"
  
  set +e
  http_status_code=$(curl -o "$new_input_data_path" --fail-with-body "$released_data_endpoint"  -H "If-None-Match: $last_etag" -D "$new_input_header_path" -w "%{http_code}")
  exit_code=$?
  set -e
  echo "Release data request returned with http status code: $http_status_code"
  if [ "$http_status_code" -eq 304 ]; then
    echo "State in Loculus backend has not changed: HTTP 304 Not Modified."
    rm -rf "$new_input_data_dir"
    exit 0
  fi
  if [ $exit_code -ne 0 ]; then
    echo "Curl command failed with exit code $exit_code, cleaning up and exiting."
    rm -rf "$new_input_data_dir"
    exit $exit_code
  fi

  echo "Header from response: $(cat "$new_input_header_path")"
  etag=$(grep -i '^etag:' "$new_input_header_path" | awk '{print $2}')
  echo "etag from header: $etag"
  echo "$etag" > "$new_etag_path"

  echo "downloaded sequences"
  ls -l "$new_input_data_dir"

  expected_record_count=$(grep -i '^x-total-records:' "$new_input_header_path" | awk '{print $2}' | tr -d '[:space:]')
  echo "Response should contain a total of : $expected_record_count records"

  # jq validates each individual json object, to catch truncated lines
  true_record_count=$(zstd -d -c "$new_input_data_path" | jq -n 'reduce inputs as $item (0; . + 1)' | tr -d '[:space:]')
  echo "Response contained a total of : $true_record_count records"

  if [ "$true_record_count" -ne "$expected_record_count" ]; then
    echo "Expected and actual number of records are not the same"
    echo "Deleting new input data dir $new_input_data_dir"
    rm -rf "$new_input_data_dir"
    exit 0
  fi

  echo "checking for old input data dir $old_input_data_dir"
  if [[ -f "$old_input_data_path" ]]; then
    if [[ -f "$old_input_touchfile" ]]; then
      echo "Old input data dir was not processed successfully"
      echo "Skipping hash check, deleting old input data dir"
      rm -rf "$old_input_data_dir"
    else
      echo "Old input data dir was processed successfully"
      old_hash=$(md5sum < "$old_input_data_path" | awk '{print $1}')
      new_hash=$(md5sum < "$new_input_data_path" | awk '{print $1}')
      echo "old hash: $old_hash"
      echo "new hash: $new_hash"
      if [ "$new_hash" = "$old_hash" ]; then
        echo "Hashes are equal, skipping preprocessing"
        update_etag
        echo "Deleting new input data dir $new_input_data_dir"
        rm -rf "$new_input_data_dir"
        exit 0
      else
        echo "Hashes are unequal, deleting old input data dir"
        rm -rf "$old_input_data_dir"
      fi
    fi
  else
    echo "No old input data found at $old_input_data_path"
  fi
  echo
}

# Generate the preprocessing config file with the lineage file for the current pipeline version.
# the lineage definition file needs to be downloaded first.
prepare_preprocessing_config() {
  rm -f $lineage_definition_file $preprocessing_config_file_merged

  if [[ -z "$LINEAGE_DEFINITIONS" ]]; then
    echo "No LINEAGE_DEFINITIONS given, nothing to configure;"
    cp $preprocessing_config_file $preprocessing_config_file_merged
    return
  fi

  pipelineVersion=$(zstd -d -c "$new_input_data_path" | jq -r '.metadata.pipelineVersion' | sort -u)

  if [[ -z "$pipelineVersion" ]]; then
    echo "No pipeline version found. Writing empty lineage definition file."
    touch $lineage_definition_file
  elif [[ $(echo "$pipelineVersion" | wc -l) -eq 1 ]]; then
    echo "Single pipeline version: $pipelineVersion"

    # Get the URL for the version from LINEAGE_DEFINITIONS
    lineage_url=$(echo "$LINEAGE_DEFINITIONS" | jq -r --arg version "$pipelineVersion" '.[$version]')
    if [[ -z "$lineage_url" || "$lineage_url" == "null" ]]; then
      echo "Error: No URL defined for pipeline version $pipelineVersion."
      exit 1
    fi

    # Download the file from the URL
    if ! curl -s -o "$lineage_definition_file" "$lineage_url"; then
      echo "Error: Failed to download file from $lineage_url."
      exit 1
    fi  
  else
    echo "Multiple pipeline versions in data to import: $pipelineVersion"
    exit 1
  fi

  # the lineage definition filename needs to be set in the config
  # Once https://github.com/GenSpectrum/LAPIS-SILO/pull/633 is merged, it can be done as a commandline arg
  cp $preprocessing_config_file $preprocessing_config_file_merged
  echo -e "lineageDefinitionsFilename: \"$lineage_definition_file\"\n" >> $preprocessing_config_file_merged
}

preprocessing() {
  echo "Starting preprocessing"

  rm -f "$silo_input_data_path"

  # This is necessary because the silo preprocessing is configured to expect the input data
  # at /preprocessing/input/data.ndjson.zst
  cp "$new_input_data_path" "$silo_input_data_path"
  
  set +e
  time /app/siloApi --preprocessing --preprocessingConfig=$preprocessing_config_file_merged
  exit_code=$?
  set -e

  if [ $exit_code -ne 0 ]; then
    echo "SiloApi command failed with exit code $exit_code, cleaning up and exiting."
    delete_all_input # Delete input so that we don't skip preprocessing next time due to hash equality
    exit $exit_code
  fi

  echo "SiloApi command succeeded"
  echo "Removing touchfile $new_input_touchfile to indicate successful processing"
  rm "$new_input_touchfile"

  update_etag
}

filecontent_or_zero() {
  if [ -f "$1" ]; then
    cat "$1" | tr -d '[:space:]'
  else
    echo 0
  fi
}

update_etag() {
  new_etag=$(filecontent_or_zero "$new_etag_path")
  old_etag=$(filecontent_or_zero "$current_etag_path")
  echo "Updating etag in file from $old_etag to $new_etag"
  cp "$new_etag_path" "$current_etag_path"
}

# Potential race condition: silo might not release non-current dir if it's still being used
cleanup_output_data() {
  for dir_type in "input" "output"; do
    dir="$preprocessing_dir/$dir_type"
    echo "Removing all but the most recent $dir_type directory in $dir"
    cd "$dir" || exit

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
  echo "Script started at: $(date)"

  echo "Current content of input data dir: $input_data_dir"
  ls -l "$input_data_dir"
  echo "Current content of output data dir: $output_data_dir"
  ls -l "$output_data_dir"
  echo

  # cleanup at start in case we fail later
  cleanup_output_data
  download_data
  prepare_preprocessing_config
  preprocessing

  echo "done"
  echo "----------END OF RUN-----------------"
}

main
