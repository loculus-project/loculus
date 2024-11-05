#!/bin/bash

# Check if the correct number of arguments is provided
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <image_directory>"
    exit 1
fi

# Directory containing images
IMAGE_DIR="$1"

# Loop over all jpg files in the directory
for img in "$IMAGE_DIR"/*.jpg; do
    # Extract the filename without extension
    filename=$(basename "$img" .jpg)

    # Skip files that already have '_small' in their filename
    if [[ $filename != *"_small" ]]; then
        # Resize, compress the JPEG and save it
        magick "$img" -resize 220x\> -strip -quality 85 "$IMAGE_DIR/${filename}_small.jpg"
    fi
done
