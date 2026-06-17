#!/bin/bash
# Split helm template output into separate files based on "# Source:" comments
# Usage: split-helm-output.sh <input-file> <output-directory>

set -euo pipefail

INPUT_FILE="$1"
OUTPUT_DIR="$2"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Use awk to split the file based on "# Source:" markers
awk -v output_dir="$OUTPUT_DIR" '
BEGIN {
    file_count = 0
    current_file = ""
}

# When we hit a "# Source:" line, extract the template name
/^# Source: / {
    # Extract the source path after "# Source: "
    source_path = $0
    sub(/^# Source: /, "", source_path)

    # Remove the chart name prefix (e.g., "loculus/templates/" -> "")
    sub(/^[^\/]+\/templates\//, "", source_path)

    # Replace .yaml extension and create filename
    sub(/\.yaml$/, "", source_path)

    # Handle templates with slashes (subdirectories)
    current_file = output_dir "/" source_path ".yaml"

    # Create directory if needed
    dir = current_file
    sub(/\/[^\/]+$/, "", dir)
    system("mkdir -p \"" dir "\"")

    file_count++

    # Print the source comment to the file
    print > current_file
    next
}

# Skip empty lines at the start before any source is defined
current_file == "" && /^[[:space:]]*$/ {
    next
}

# Write all other lines to the current file
current_file != "" {
    print >> current_file
}

END {
    if (file_count == 0) {
        print "Warning: No Source comments found in input file" > "/dev/stderr"
        exit 1
    }
    print "Split into " file_count " files" > "/dev/stderr"
}
' "$INPUT_FILE"

# Remove the monolithic file
rm -f "$INPUT_FILE"

echo "Successfully split helm output into $OUTPUT_DIR"
