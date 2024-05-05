#!/bin/bash

# Infinite loop to keep running the script
while true
do
    # Execute your script
    sh /silo_import_job.sh
    
    # Wait for 30 seconds before running it again
    sleep 30
done