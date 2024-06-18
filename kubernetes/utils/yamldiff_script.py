import os
import subprocess
import sys
import tempfile

import yaml


def read_yaml_metadata_name(filename):
    """Read YAML documents and index by the `metadata.name` property."""
    with open(filename, "r") as f:
        docs = yaml.load_all(f, Loader=yaml.FullLoader)
        doc_dict = {}
        for doc in docs:
            if doc and "metadata" in doc and "name" in doc["metadata"]:
                doc_name = doc["metadata"]["name"]
                doc_dict[doc_name] = doc
    return doc_dict


def diff_yaml(source_dict1, source_dict2):
    """Compare YAML documents using external 'diff' command."""
    for name, content1 in source_dict1.items():
        content2 = source_dict2.get(name, None)
        if content2:
            with tempfile.NamedTemporaryFile(
                mode="w+", delete=False
            ) as tmp1, tempfile.NamedTemporaryFile(mode="w+", delete=False) as tmp2:
                yaml.dump(content1, tmp1)
                yaml.dump(content2, tmp2)
                tmp1.flush()
                tmp2.flush()
                # Run diff command
                result = subprocess.run(
                    ["diff", tmp1.name, tmp2.name], capture_output=True, text=True
                )
                print(f"Diff for {name}: {result.stdout}") if result.stdout else None
            os.unlink(tmp1.name)
            os.unlink(tmp2.name)
        else:
            print(f"No corresponding document found for {name}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python yamldiff_script.py <yaml_file1> <yaml_file2>")
        sys.exit(1)
    yaml_file1, yaml_file2 = sys.argv[1:3]
    yaml_dict1 = read_yaml_metadata_name(yaml_file1)
    yaml_dict2 = read_yaml_metadata_name(yaml_file2)
    diff_yaml(yaml_dict1, yaml_dict2)
