#!/bin/bash

set -e

base_data_dir="/preprocessing/input"
last_timestamp_dir=$(ls -1 "$base_data_dir" | sort -n | grep -E '^[0-9]+$' | tail -n 1)

current_timestamp=$(date +%s)
echo "checking for current timestamp $current_timestamp"

data_dir="$base_data_dir/$current_timestamp"
mkdir -p "$data_dir"
echo  "created $data_dir"

released_data_endpoint="http://$BACKEND_HOST:8079/get-released-data"
echo "calling $released_data_endpoint"
curl -o "$data_dir/data.ndjson" --fail-with-body "$released_data_endpoint"

echo "downloaded $(wc -l < "$data_dir/data.ndjson") sequences"

if [[ "$last_timestamp_dir" =~ ^[0-9]+$ ]];
then
  last_number_of_sequences=$(wc -l < "$base_data_dir/$last_timestamp_dir/data.ndjson")
  echo "checking on last data dir '$last_timestamp_dir', has $last_number_of_sequences lines"
  if [ "$last_number_of_sequences" -eq "$(wc -l < "$data_dir/data.ndjson")" ];
  then
    echo "last data.ndjson has same line count, deleting current data dir"
    rm -rf "$data_dir"
    exit 0
  fi
fi

if [ -s "$data_dir/data.ndjson" ]
then
  echo "data.ndjson is not empty, starting preprocessing"

  rm -f "$base_data_dir/data.ndjson"
  cp "$data_dir/data.ndjson" "$base_data_dir/data.ndjson"

  /app/siloApi --preprocessing

  echo "preprocessing for $current_timestamp done"
else
  echo "skipping empty data.ndjson, deleting directory"
  rm -rf "$data_dir"
fi
