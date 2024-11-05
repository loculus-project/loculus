#!/bin/bash

# Check if the correct number of arguments is provided
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <image_directory>"
    exit 1
fi

# Directory containing images
IMAGE_DIR="$1"

# Check if the directory exists
if [ ! -d "$IMAGE_DIR" ]; then
    echo "Error: Directory '$IMAGE_DIR' does not exist."
    exit 1
fi

# Enable nullglob to avoid errors when no .jpg files are found
shopt -s nullglob

# Count the number of jpg files
jpg_files=("$IMAGE_DIR"/*.jpg)

if [ ${#jpg_files[@]} -eq 0 ]; then
    echo "No JPG files found in '$IMAGE_DIR'."
    exit 0
fi

# Loop over all jpg files in the directory
for img in "${jpg_files[@]}"; do
    # Extract the filename without extension
    filename=$(basename "$img" .jpg)

    # Skip files that already have '_small' in their filename
    if [[ $filename != *"_small" ]]; then
        # Resize, compress the JPEG and save it
        magick "$img" -resize 220x\> -strip -quality 85 "$IMAGE_DIR/${filename}_small.jpg"
    fi
done
