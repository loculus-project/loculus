#!/usr/bin/env python3
"""
Format JSON content embedded in YAML files for better readability.

This script processes YAML files and reformats any embedded JSON content
(identified by keys ending in .json:) with proper indentation.
"""

import json
import re
import sys
from pathlib import Path


def format_json_in_yaml(content: str) -> str:
    """
    Find and format JSON content embedded in YAML files.

    Looks for patterns like:
      some_file.json: |
        {"minified": "json", ...}

    And reformats the JSON with proper indentation.
    """
    lines = content.split('\n')
    result = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Check if this line indicates start of embedded JSON
        # Pattern: "  key.json: |" or "  key.json: |-"
        match = re.match(r'^(\s*)(\S+\.json):\s*\|(-?)?\s*$', line)

        if match:
            indent = match.group(1)
            key = match.group(2)
            block_indicator = '|' + (match.group(3) or '')
            result.append(line)
            i += 1

            # Collect JSON content
            json_lines = []
            json_indent = None

            while i < len(lines):
                current_line = lines[i]

                # Empty lines within the block are preserved
                if not current_line.strip():
                    # Check if next non-empty line is still part of the block
                    if i + 1 < len(lines):
                        next_non_empty = i + 1
                        while next_non_empty < len(lines) and not lines[next_non_empty].strip():
                            next_non_empty += 1
                        if next_non_empty < len(lines):
                            next_line = lines[next_non_empty]
                            # If next line has less or equal indent than key, block is done
                            if next_line and not next_line.startswith(indent + '  '):
                                break
                    json_lines.append('')
                    i += 1
                    continue

                # Check if line is still part of the JSON block (more indented than the key)
                if current_line.startswith(indent + '  ') or (json_indent and current_line.startswith(json_indent)):
                    if json_indent is None:
                        # Determine the indentation of the JSON content
                        json_indent = re.match(r'^(\s*)', current_line).group(1)
                    json_lines.append(current_line)
                    i += 1
                else:
                    break

            # Try to parse and reformat the JSON
            if json_lines:
                # Remove the JSON indentation to get raw JSON
                raw_json = '\n'.join(
                    line[len(json_indent):] if line.startswith(json_indent) else line
                    for line in json_lines
                )
                raw_json = raw_json.strip()

                try:
                    parsed = json.loads(raw_json)
                    # Format with 2-space indentation
                    formatted = json.dumps(parsed, indent=2, ensure_ascii=False)
                    # Add proper YAML indentation (2 more spaces than the key)
                    yaml_indent = indent + '    '
                    for formatted_line in formatted.split('\n'):
                        result.append(yaml_indent + formatted_line)
                except json.JSONDecodeError:
                    # If JSON parsing fails, keep original content
                    result.extend(json_lines)
        else:
            result.append(line)
            i += 1

    return '\n'.join(result)


def process_file(file_path: Path) -> bool:
    """Process a single YAML file. Returns True if file was modified."""
    content = file_path.read_text()

    # Check if file contains embedded JSON
    if '.json: |' not in content:
        return False

    formatted = format_json_in_yaml(content)

    if formatted != content:
        file_path.write_text(formatted)
        return True

    return False


def main():
    if len(sys.argv) < 2:
        print("Usage: format-json-in-yaml.py <directory>", file=sys.stderr)
        sys.exit(1)

    directory = Path(sys.argv[1])

    if not directory.is_dir():
        print(f"Error: {directory} is not a directory", file=sys.stderr)
        sys.exit(1)

    modified_count = 0
    for yaml_file in directory.rglob('*.yaml'):
        if process_file(yaml_file):
            print(f"Formatted JSON in: {yaml_file}")
            modified_count += 1

    print(f"Formatted {modified_count} file(s)")


if __name__ == '__main__':
    main()
