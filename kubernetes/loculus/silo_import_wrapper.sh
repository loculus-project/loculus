#!/bin/bash

input_data_dir="/preprocessing/input"
current_snapshot_time="$input_data_dir/snapshot_time.txt"

if [ -f "$current_snapshot_time" ]; then
    last_snapshot_time=$(cat "$FILE")
else
    last_snapshot_time=0
fi

echo "Data in SILO corresponds to data in Loculus at time: $current_snapshot_time"
while true
do
    bash /silo_import_job.sh --last-snapshot="$last_snapshot_time"
    sleep 30
done
