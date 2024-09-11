#!/bin/bash

set -ex

# Define the Docker container name for easy reference
CONTAINER_NAME="lapis_silo_setup"

# Stop and remove any existing container with the same name
docker stop $CONTAINER_NAME 2>/dev/null
docker rm $CONTAINER_NAME 2>/dev/null

# Pull the container image
docker pull ghcr.io/genspectrum/lapis-silo

# Start the container in detached mode with a command to keep it alive indefinitely
# and set the entry point to /bin/bash
docker run -dit --name $CONTAINER_NAME -v "$(pwd):/mnt" --entrypoint /bin/bash ghcr.io/genspectrum/lapis-silo -c "sleep infinity"

# Wait for a few seconds to ensure the container is up and running
sleep 5

# Check if the container is running
if docker ps | grep -q $CONTAINER_NAME; then
    echo "Container is running. Executing setup commands..."
    # Execute setup commands
    docker exec $CONTAINER_NAME sh -c 'curl https://raw.githubusercontent.com/GenSpectrum/LAPIS-SILO-e2e/main/testsets/ebolaZaire/data/database_config.yaml -o database_config.yaml'
    docker exec $CONTAINER_NAME sh -c 'mkdir -p /preprocessing/input'
    docker exec $CONTAINER_NAME sh -c 'curl https://raw.githubusercontent.com/GenSpectrum/LAPIS-SILO-e2e/main/testsets/ebolaZaire/data/reference_genomes.json -o /preprocessing/input/reference_genomes.json'
    docker exec $CONTAINER_NAME sh -c '/mnt/silo_import_job.sh --backend-base-url="https://backend-table-update-tracker-anya.loculus.org/ebola-zaire" --root-dir="/mnt"'
else
    echo "Failed to start the container. Checking logs for errors..."
    # Output the logs for debugging
    docker logs $CONTAINER_NAME
fi
