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
    echo "Checking for new data in SILO"
    last_snapshot_time=$(get_time_from_file "$current_snapshot_time_path")
    echo "Last download of released data had etag: $last_snapshot_time"

    last_hard_refresh_time=$(get_time_from_file "$last_hard_refresh_time_path")
    echo "Last hard refresh was at: $last_hard_refresh_time"
    
    # Check if the difference is greater than or equal to 3600 seconds (1 hour)
    # We only use cache 
    current_time=$(date +%s)
    echo "Current timestamp: $current_time"
    time_diff=$((current_time - last_hard_refresh_time))
    if [ "$time_diff" -ge 3600 ]; then
        echo "Last hard refresh was more than 1 hour ago. Performing hard refresh."
        bash /silo_import_job.sh --last-snapshot=0 --backend-base-url="$BACKEND_BASE_URL"
        exit_code=$?
        if [ "$exit_code" -ne 0 ]; then
            echo "Error: Hard refresh failed with exit code $exit_code"
        else
            echo "Hard refresh completed successfully"
            echo "$current_time" > "$last_hard_refresh_time_path"
        fi
    else
        echo "Last hard refresh was less than 1 hour ago. Passing last snapshot time to import job: $last_snapshot_time"
        bash /silo_import_job.sh --last-snapshot="$last_snapshot_time" --backend-base-url="$BACKEND_BASE_URL"
    fi
    echo "Sleeping for 30 seconds"
    sleep 30
done
