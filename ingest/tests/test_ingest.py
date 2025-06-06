import json
import os
import shutil
import subprocess
from pathlib import Path

import orjsonl
import pandas as pd
import pytest

# Define the paths to your test data and expected output
TEST_DATA_DIR = Path("tests")
EXPECTED_OUTPUT_DIR = Path("tests/expected_output_cchf")
OUTPUT_DIR = Path("results")
CONFIG_DIR = Path("config")


def delete_directory(directory):
    """
    Deletes the specified directory and all its contents.
    """
    if os.path.exists(directory):
        shutil.rmtree(directory)
        print(f"Deleted directory: {directory}")
    else:
        print(f"Directory does not exist: {directory}")


def copy_files(src_dir, dst_dir):
    """
    Recursively copies files and directories from src_dir to dst_dir,
    maintaining the hierarchy. Updates modification times of copied items
    to the current time.
    """
    src_path = Path(src_dir)
    dst_path = Path(dst_dir)

    # Ensure the destination parent directory exists
    dst_path.parent.mkdir(parents=True, exist_ok=True)

    # Recursively copy the source directory tree to the destination
    # dirs_exist_ok=True allows merging into an existing directory
    shutil.copytree(src_path, dst_path, dirs_exist_ok=True)


def compare_json_files(file1, file2):
    with open(file1, encoding="utf-8") as f1, open(file2, encoding="utf-8") as f2:
        json1 = json.load(f1)
        json2 = json.load(f2)

    return json1 == json2


def compare_ndjson_files(file1, file2):
    def create_dict_from_ndjson(file):
        records = {}
        for record in orjsonl.stream(file):  # type: ignore
            if not isinstance(record, dict):
                error = f"Expected a dict, got {type(record)} in {file}"
                raise TypeError(error)
            records[record["id"]] = record["metadata"]
        return records

    dict1 = create_dict_from_ndjson(file1)
    dict2 = create_dict_from_ndjson(file2)

    if set(dict1.keys()) != set(dict2.keys()):
        print(f"Keys do not match: {dict1.keys()} vs {dict2.keys()}")
        return False
    for key in dict1:
        if dict1[key] != dict2[key]:
            for field in dict1[key]:
                if field not in dict2[key]:
                    print(f"Field {field} not found in second file for key {key}")
                elif dict1[key][field] != dict2[key][field]:
                    print(
                        f"Field {field} does not match for key {key}: {dict1[key][field]} vs {dict2[key][field]}"
                    )
            for field in dict2[key]:
                if field not in dict1[key]:
                    print(f"Field {field} not found in first file for key {key}")
            return False

    return dict1 == dict2


def compare_tsv_files(file1, file2):
    df1 = pd.read_csv(file1, sep="\t")
    df2 = pd.read_csv(file2, sep="\t")

    df1_sorted = df1.sort_index(axis=1)
    df2_sorted = df2.sort_index(axis=1)

    # Compare the dataframes and print the differences
    comparison = df1_sorted.compare(df2_sorted)

    if comparison.empty:
        print("The files are identical.")
    else:
        print("Differences found:")
        print(comparison)

    # Compare the contents
    return df1.sort_index(axis=1).equals(df2.sort_index(axis=1))


def run_snakemake(rule, touch=False):
    """
    Function to run Snakemake with the test data.
    """
    cmd = [
        "snakemake",
        rule,
        "--snakefile",
        "Snakefile",
        "--cores",
        "1",
    ]
    if touch:
        cmd.append("--touch")
    subprocess.run(cmd, check=True)


def test_snakemake():
    """
    Test function to run the Snakemake workflow and verify output.
    """
    delete_directory(OUTPUT_DIR)
    destination_directory = OUTPUT_DIR
    source_directory = TEST_DATA_DIR / "test_data_cchf"
    copy_files(source_directory, destination_directory)
    destination_directory = CONFIG_DIR
    source_directory = TEST_DATA_DIR / "config_cchf"
    copy_files(source_directory, destination_directory)
    run_snakemake("fetch_inflate_ncbi_dataset_package", touch=True)
    run_snakemake("format_ncbi_dataset_sequences", touch=True)  # Ignore sequences for now
    run_snakemake("get_loculus_depositions", touch=True)  # Do not call_loculus
    run_snakemake("heuristic_group_segments")
    run_snakemake("get_previous_submissions", touch=True)  # Do not call_loculus
    run_snakemake("compare_hashes")
    run_snakemake("prepare_files")

    # Check that the output files match the expected files
    for expected_file in EXPECTED_OUTPUT_DIR.glob("*.json"):
        output_file = OUTPUT_DIR / expected_file.name
        assert output_file.exists(), f"{output_file} does not exist."
        assert compare_json_files(
            expected_file,
            output_file,
        ), f"{output_file} does not match {expected_file}."

    for expected_file in EXPECTED_OUTPUT_DIR.glob("*.tsv"):
        output_file = OUTPUT_DIR / expected_file.name
        assert output_file.exists(), f"{output_file} does not exist."
        assert compare_tsv_files(
            expected_file,
            output_file,
        ), f"{output_file} does not match {expected_file}."

    for expected_file in EXPECTED_OUTPUT_DIR.glob("*.ndjson"):
        output_file = OUTPUT_DIR / expected_file.name
        assert output_file.exists(), f"{output_file} does not exist."
        assert compare_ndjson_files(
            expected_file,
            output_file,
        ), f"{output_file} does not match {expected_file}."


if __name__ == "__main__":
    pytest.main(["-v"])
