#!/bin/bash

HARD_REFRESH_INTERVAL=3600

input_data_dir="/preprocessing/input"
current_etag_path="$input_data_dir/etag.txt"
last_hard_refresh_time_path="$input_data_dir/last_hard_refresh_time.txt"

get_value_from_file() {
    if [ -f "$1" ]; then
        cat "$1" | tr -d '[:space:]'
    else
        echo 0
    fi
}

while true
do
    echo "Checking for new data in SILO"
    last_etag=$(get_value_from_file "$current_etag_path")
    echo "Last download of released data had etag: $last_etag"

    last_hard_refresh_time=$(get_value_from_file "$last_hard_refresh_time_path")
    echo "Last hard refresh was at: $last_hard_refresh_time"
    
    # Check if the difference is greater than or equal to 3600 seconds (1 hour)
    # We only use cache 
    current_time=$(date +%s)
    echo "Current timestamp: $current_time"
    time_diff=$((current_time - last_hard_refresh_time))
    if [ "$time_diff" -ge $HARD_REFRESH_INTERVAL ]; then
        echo "Last hard refresh was more than 1 hour ago. Performing hard refresh."
        bash /silo_import_job.sh --last-etag=0 --backend-base-url="$BACKEND_BASE_URL"
        exit_code=$?
        if [ "$exit_code" -ne 0 ]; then
            echo "Error: Hard refresh failed with exit code $exit_code"
        else
            echo "Hard refresh completed successfully"
            echo "$current_time" > "$last_hard_refresh_time_path"
        fi
    else
        echo "Last hard refresh was less than 1 hour ago. Passing last etag time to import job: $last_etag"
        bash /silo_import_job.sh --last-etag="$last_etag" --backend-base-url="$BACKEND_BASE_URL"
    fi
    echo "Sleeping for 30 seconds"
    sleep 30
done
