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
        for record in orjsonl.stream(file):
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


def compare_tsv_files(file1, file2):  # noqa: C901
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


def run_snakemake(rule, touch=False, config_overrides: dict[str, str] | None = None):
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
    if config_overrides:
        cmd.append("--config")
        cmd.extend(f"{k}={v}" for k, v in config_overrides.items())
    subprocess.run(cmd, check=True)  # noqa: S603


def read_record_by_id(ndjson_path, submission_id):
    """
    Retrieve a record from an ndjson file for a given submission id.
    Raises if the submission is not found.
    """
    for record in orjsonl.stream(str(ndjson_path)):
        if record["id"] == submission_id:
            return record
    msg = f"{submission_id} not found in {ndjson_path}"
    raise AssertionError(msg)


def prepare_compare_hashes_inputs(config_overrides: dict[str, str] | None = None):
    """
    Set up a fresh workspace and run the first steps of the ingest pipeline.

    After this, the results directory wil contain previous_submissions.ndjson
    and metadata_post_group.ndjson

    config_overrides can be added used to alter/extend the base config loaded from
    CONFIG_DIR. This can be used to avoid making different config.yaml files
    for individual tests
    """
    delete_directory(OUTPUT_DIR)
    copy_files(TEST_DATA_DIR / "test_data_cchf", OUTPUT_DIR)
    copy_files(TEST_DATA_DIR / "config_cchf", CONFIG_DIR)
    # Touch the rules that would otherwise hit the network; only group/compare run for real.
    run_snakemake(
        "fetch_inflate_ncbi_dataset_package", touch=True, config_overrides=config_overrides
    )
    run_snakemake("format_ncbi_dataset_sequences", touch=True, config_overrides=config_overrides)
    run_snakemake("get_loculus_depositions", touch=True, config_overrides=config_overrides)
    run_snakemake("heuristic_group_segments", config_overrides=config_overrides)
    run_snakemake("get_previous_submissions", touch=True, config_overrides=config_overrides)


def test_snakemake():
    """
    Test function to run the Snakemake workflow and verify output.
    """
    prepare_compare_hashes_inputs()
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


def test_muted_hashes_prevents_revision():
    """
    Tests the manual muting of specific hashes in the ingest pipeline.
    """
    target_loculus = "LOC_0000VXA"
    target_submission = "KX096703.1.S"
    config_overrides = {"muted_hashes_url": "https://some_url.com"}

    prepare_compare_hashes_inputs(config_overrides)

    # Get the hash value for KX096703.1.S, then create a tsv to mute it
    record = read_record_by_id(OUTPUT_DIR / "metadata_post_group.ndjson", target_submission)
    hash_to_mute = record["metadata"]["hash"]
    pd.DataFrame([{"accession": target_loculus, "hash_digest": hash_to_mute}]).to_csv(
        OUTPUT_DIR / "muted_hashes.tsv", sep="\t", index=False
    )

    # # The tsv is already in place, so just need to --touch the download rule
    run_snakemake("download_muted_hashes", touch=True, config_overrides=config_overrides)
    run_snakemake("compare_hashes", config_overrides=config_overrides)

    to_revise = json.loads((OUTPUT_DIR / "to_revise.json").read_text(encoding="utf-8"))
    unchanged = json.loads((OUTPUT_DIR / "unchanged.json").read_text(encoding="utf-8"))

    assert target_submission not in to_revise, (
        f"{target_submission} should not be revised when hash_to_mute is in muted_hashes.tsv"
    )
    assert unchanged.get(target_submission) == target_loculus, (
        f"{target_submission} should be recorded as unchanged -> {target_loculus}"
    )


def test_raw_reads_attached_from_ena_trigger_revision():
    """
    Tests that ENA raw reads are attached to an entry via its BioSample,
    which changes its hash so that the entry is revised.
    """
    target_loculus = "LOC_0000CC2"
    target_submission = "KX014001.1.S"
    config_overrides = {"ingest_raw_reads": "true"}

    prepare_compare_hashes_inputs(config_overrides)

    # Give the target a BioSample that has a run at ENA
    metadata_path = OUTPUT_DIR / "metadata_post_group.ndjson"
    records = list(orjsonl.stream(str(metadata_path)))
    for record in records:
        if record["id"] == target_submission:
            record["metadata"]["biosampleAccession"] = "SAMN00000001"
    orjsonl.save(str(metadata_path), records)
    fastq_dir = "ftp.sra.ebi.ac.uk/vol1/fastq/SRR000/001/SRR0000001"
    pd.DataFrame(
        [
            {
                "run_accession": "SRR0000001",
                "sample_accession": "SAMN00000001",
                "instrument_model": "Illumina MiSeq",
                "base_count": 1000,
                "fastq_ftp": f"{fastq_dir}/SRR0000001_1.fastq.gz;{fastq_dir}/SRR0000001_2.fastq.gz",
                "fastq_bytes": "100;101",
                "fastq_md5": "md5a;md5b",
            }
        ]
    ).to_csv(OUTPUT_DIR / "ena_read_runs.tsv", sep="\t", index=False)

    run_snakemake("fetch_ena_read_runs", touch=True, config_overrides=config_overrides)
    run_snakemake("attach_raw_reads", config_overrides=config_overrides)
    run_snakemake("get_previous_submissions", touch=True, config_overrides=config_overrides)
    run_snakemake("compare_hashes", config_overrides=config_overrides)
    run_snakemake("prepare_files", config_overrides=config_overrides)

    to_revise = json.loads((OUTPUT_DIR / "to_revise.json").read_text(encoding="utf-8"))
    unchanged = json.loads((OUTPUT_DIR / "unchanged.json").read_text(encoding="utf-8"))
    assert to_revise.get(target_submission) == target_loculus
    assert target_submission not in unchanged
    # Entries without raw reads keep their hash and are not revised
    assert unchanged == {"KX014000.1.M": "LOC_0000CC1"}

    revised = pd.read_csv(OUTPUT_DIR / "revise_metadata.tsv", sep="\t", dtype=str).set_index("id")
    assert json.loads(revised.loc[target_submission, "files.rawReads"]) == [
        {
            "name": "SRR0000001_1.fastq.gz",
            "url": f"https://{fastq_dir}/SRR0000001_1.fastq.gz",
            "size": 100,
        },
        {
            "name": "SRR0000001_2.fastq.gz",
            "url": f"https://{fastq_dir}/SRR0000001_2.fastq.gz",
            "size": 101,
        },
    ]
    assert revised.loc[target_submission, "sequencingInstrument"] == "Illumina MiSeq"


if __name__ == "__main__":
    pytest.main(["-v"])
