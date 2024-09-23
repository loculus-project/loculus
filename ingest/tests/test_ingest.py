import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

# Define the paths to your test data and expected output
TEST_DATA_DIR = Path("tests")
EXPECTED_OUTPUT_DIR = Path("tests/expected_output_cchf")
OUTPUT_DIR = Path("results")
CONFIG_DIR = Path("config")


def copy_files(src_dir, dst_dir):
    src_path = Path(src_dir)
    dst_path = Path(dst_dir)

    # Create destination directory if it doesn't exist
    dst_path.mkdir(parents=True, exist_ok=True)

    for item in src_path.iterdir():
        if item.is_file():
            dest_file_path = dst_path / item.name
            shutil.copy2(item, dest_file_path)
            os.utime(dest_file_path, None)


def compare_json_files(file1, file2):
    with open(file1, encoding="utf-8") as f1, open(file2, encoding="utf-8") as f2:
        json1 = json.load(f1)
        json2 = json.load(f2)

    return json1 == json2


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
    destination_directory = OUTPUT_DIR
    source_directory = TEST_DATA_DIR / "test_data_cchf"
    copy_files(source_directory, destination_directory)
    destination_directory = CONFIG_DIR
    source_directory = TEST_DATA_DIR / "config_cchf"
    copy_files(source_directory, destination_directory)
    run_snakemake("get_loculus_submissions", touch=True)  # Do not call_loculus
    run_snakemake("group_segments")
    run_snakemake("get_previous_submissions", touch=True)  # Do not call_loculus
    run_snakemake("compare_hashes")

    # Check that the output files match the expected files
    for expected_file in EXPECTED_OUTPUT_DIR.glob("*.json"):
        output_file = OUTPUT_DIR / expected_file.name
        assert output_file.exists(), f"{output_file} does not exist."
        assert compare_json_files(
            expected_file,
            output_file,
        ), f"{output_file} does not match {expected_file}."


if __name__ == "__main__":
    pytest.main(["-v"])
