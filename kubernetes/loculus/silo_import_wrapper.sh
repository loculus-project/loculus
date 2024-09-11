#!/bin/bash

input_data_dir="/preprocessing/input"
current_snapshot_time="$input_data_dir/snapshot_time.txt"

while true
do
    if [ -f "$current_snapshot_time" ]; then
        last_snapshot_time=$(cat "$current_snapshot_time" | tr -d '[:space:]')
    else
        last_snapshot_time=0
    fi
    echo "Data in SILO corresponds to data in Loculus at time: $last_snapshot_time"
    
    # Check if the difference is greater than or equal to 3600 seconds (1 hour)
    current_time=$(date +%s)
    time_diff=$((current_time - last_snapshot_time))
    if [ "$time_diff" -ge 3600 ]; then
        echo "Data in SILO is over 1h older than Loculus, ask for all data regardless of last-modified-since tag."
        bash silo_import_job.sh --last-snapshot=0
    else
        bash silo_import_job.sh --last-snapshot="$last_snapshot_time"
    fi
    sleep 30
done
