"""
rule upload_reads:
input:
    reads=directory("results/reads"),
    script="scripts/upload_reads.py",
    config="results/config.yaml",
    metadata_submit="results/submit_metadata_sorted.tsv",
    metadata_revise="results/revise_metadata_sorted.tsv",
output:
    uploaded_reads="results/uploaded_reads.json",
shell:
    python {input.script} \
        --reads-dir {input.reads} \
        --config-file {input.config} \
        --metadata-submit {input.metadata_submit} \
        --metadata-revise {input.metadata_revise} \
        --output {output.uploaded_reads}
"""

# This script uploads reads to Loculus file sharing and returns
# a mapping of submission ids to file names and ids

# For each of the metadata files, check if there's anything in the
# insdcRawReadsAccession column
# If so, then upload the reads to Loculus file sharing and put the received id into the output json

# %%
import glob
import json
from dataclasses import dataclass
from http import HTTPMethod

import call_loculus
import requests
import yaml
from call_loculus import Config

# %%


def get_config(config_file: str) -> Config:
    """Load configuration from a YAML file."""
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
    relevant_config = {}
    relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
    return Config(**relevant_config)


# %%
def get_upload_url_and_id() -> tuple[str, str]:
    config = get_config("results/config.yaml")

    resp = call_loculus.make_request(
        config=config,
        method=HTTPMethod.POST,
        url=f"{config.backend_url}/files/request-upload",
        params={
            "groupId": 1,
            "numberFiles": 1,
        },
    )

    result = resp.json()[0]

    return result["url"], result["fileId"]


# %%


def upload_reads(read_acc: str) -> dict[str, str]:
    # First look up what reads there are in the reads directory
    reads_dir = "results/reads"
    # Use a glob as we don't know the exact file names
    read_files = glob.glob(f"{reads_dir}/{read_acc}/*.fastq.gz")

    result = {}

    for file in read_files:
        # Here we would upload the file to Loculus file sharing
        # For now, let's just print the file name
        url, file_id = get_upload_url_and_id()
        print(f"Uploading {file} to {url} with file ID {file_id}")

        with open(file, "rb") as f:
            response = requests.put(url, data=f)

        if response.status_code != 200:
            raise Exception(f"Failed to upload {file}. Status code: {response.status_code}")

        print(f"Successfully uploaded {file} with file ID {file_id}")
        # Get just the last part of the file name
        file_name = file.split("/")[-1]
        result[file_name] = file_id

    return result


# %%
# For now let's loook at "metadata_post_prepare.ndjson"

with open("results/metadata_post_prepare.ndjson", encoding="utf-8") as f:
    metadata = [json.loads(line) for line in f]


result: dict[str, dict[str, dict[str,str]]] = {}

for entry in metadata:
    entry_metadata = entry.get("metadata", {})
    read_acc_str = entry_metadata.get("insdcRawReadsAccession", "")
    if not read_acc_str:
        continue

    read_accs = read_acc_str.split(",")

    result[entry["id"]] = {}

    for read_acc in read_accs:
        if not read_acc:
            continue

        # Here we would upload the reads to Loculus file sharing
        # For now, let's just print the accession
        file_ids = upload_reads(read_acc)
        result[entry["id"]][read_acc] = file_ids


print(json.dumps(result, indent=2))
# %%
