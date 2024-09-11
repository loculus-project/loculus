#!/bin/bash

input_data_dir="/preprocessing/input"
current_snapshot_time_path="$input_data_dir/snapshot_time.txt"
last_hard_refresh_time_path="$input_data_dir/last_hard_refresh_time.txt"

get_time_from_file() {
    if [ -f "$1" ]; then
        cat "$1" | tr -d '[:space:]'
    else
        echo 0
    fi
}

while true
do
    last_snapshot_time=$(get_time_from_file "$current_snapshot_time_path")
    echo "Data in SILO corresponds to data in Loculus at time: $last_snapshot_time"

    last_hard_refresh_time=$(get_time_from_file "$last_hard_refresh_time_path")
    
    # Check if the difference is greater than or equal to 3600 seconds (1 hour)
    # We only use cache 
    current_time=$(date +%s)
    time_diff=$((current_time - last_hard_refresh_time))
    if [ "$time_diff" -ge 3600 ]; then
        echo "Last hard refresh was more than 1 hour ago. Performing hard refresh."
        bash /silo_import_job.sh --last-snapshot=0
        exit_code=$?
        if [ "$exit_code" -ne 0 ]; then
            echo "Error: Hard refresh failed with exit code $exit_code"
        else
            echo "Hard refresh completed successfully"
            echo "$current_time" > "$last_hard_refresh_time_path"
        fi
    else
        bash /silo_import_job.sh --last-snapshot="$last_snapshot_time"
    fi
    sleep 30
done
