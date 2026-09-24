#!/bin/bash

set -e

get_token() {
  if [ -z "$KEYCLOAK_TOKEN_URL" ]; then
    echo "KEYCLOAK_TOKEN_URL is not set"
    exit 1
  fi

  if [ -z "$IMPORT_JOB_USER" ]; then
    echo "IMPORT_JOB_USER is not set"
    exit 1
  fi

  if [ -z "$IMPORT_JOB_USER_PASSWORD" ]; then
    echo "IMPORT_JOB_USER_PASSWORD is not set"
    exit 1
  fi

  if [ -z "$KEYCLOAK_CLIENT_ID" ]; then
    echo "KEYCLOAK_CLIENT_ID is not set"
    exit 1
  fi

  echo "Retrieving JWT from $KEYCLOAK_TOKEN_URL"
  jwt_keycloak=$(curl -X POST "$KEYCLOAK_TOKEN_URL" --fail-with-body -H 'Content-Type: application/x-www-form-urlencoded' -d "username=$IMPORT_JOB_USER&password=$IMPORT_JOB_USER_PASSWORD&grant_type=password&client_id=$KEYCLOAK_CLIENT_ID")
  jwt=$(echo "$jwt_keycloak" | jq -r '.access_token')

  if [ -z "$jwt" ]; then
    echo "Failed to retrieve JWT"
    exit 1
  fi
  echo "JWT retrieved successfully"
  echo
}

download_data() {
  base_data_dir="/preprocessing/input"
  last_timestamp_dir=$(ls -1 "$base_data_dir" | sort -n | grep -E '^[0-9]+$' | tail -n 1)

  current_timestamp=$(date +%s)
  echo "checking for current timestamp $current_timestamp"

  data_dir="$base_data_dir/$current_timestamp"
  mkdir -p "$data_dir"
  echo  "created $data_dir"

  released_data_endpoint="$BACKEND_BASE_URL/get-released-data"
  echo "calling $released_data_endpoint"
  
  set +e
  curl -o "$data_dir/data.ndjson" --fail-with-body "$released_data_endpoint" -H "Authorization: Bearer $jwt"
  exit_code=$?
  set -e

  if [ $exit_code -ne 0 ]; then
    echo "Curl command failed with exit code $exit_code, cleaning up and exiting."
    rm -rf "$data_dir"
    exit $exit_code
  fi

  echo "downloaded $(wc -l < "$data_dir/data.ndjson") sequences"
  echo

  echo "checking for last timestamp dir $last_timestamp_dir"
  if [[ "$last_timestamp_dir" =~ ^[0-9]+$ ]]; then
    last_number_of_sequences=$(wc -l < "$base_data_dir/$last_timestamp_dir/data.ndjson")

    echo "old data file $last_timestamp_dir has $last_number_of_sequences lines"
    new_number_of_sequences=$(wc -l < "$data_dir/data.ndjson")
    echo "new data file '$data_dir/data.ndjson' has $new_number_of_sequences lines"
    echo
    if [ "$last_number_of_sequences" -eq "$new_number_of_sequences" ]; then
      echo "last data.ndjson has same line count, deleting current data dir"
      rm -rf "$data_dir"
      exit 0
    else
      echo "last data.ndjson has less line count, deleting older data dir"
      rm -rf "${base_data_dir}/${last_timestamp_dir:?}"
    fi
  fi
  echo
}

preprocessing() {
  if [ -s "$data_dir/data.ndjson" ]; then
    echo "data.ndjson is not empty, starting preprocessing"

    rm -f "$base_data_dir/data.ndjson"
    cp "$data_dir/data.ndjson" "$base_data_dir/data.ndjson"
    
    set +e
    time /app/siloApi --preprocessing \
      --preprocessingConfig=/config/preprocessing_config.yaml \
      --databaseConfig=/config/database_config.yaml
    exit_code=$?
    set -e

    if [ $exit_code -ne 0 ]; then
      echo "SiloApi command failed with exit code $exit_code, cleaning up and exiting."

      rm -rf "$data_dir"
      rm -f "$base_data_dir/data.ndjson"

      exit $exit_code
    fi

    echo "preprocessing for $current_timestamp done"
  else
    echo "skipping empty data.ndjson, deleting directory"
    rm -rf "$data_dir"
  fi
  echo
}

cleanup_output_data() {
  output_data_dir="/preprocessing/output"
  echo "cleaning up output data dir $output_data_dir"
  cd $output_data_dir || exit

  if [ -n "$(ls -d */ 2>/dev/null)" ]; then
    directories=$(ls -dt */)
    if [ "$(echo "$directories" | wc -l)" -gt 1 ]; then
      newest_dir=$(echo "$directories" | head -n 1)
      echo "$directories" | tail -n +2 | xargs rm -r
      echo "Kept: $newest_dir"
    else
      echo "No directories to delete."
    fi
  else
    echo "No directories found."
  fi

  cd - > /dev/null || exit
  echo
}

main() {
  echo "----------------------------------------"
  echo "Script started at: $(date)"

  get_token
  download_data
  preprocessing
  cleanup_output_data

  echo "done"
  echo "----------------------------------------"
}

main
