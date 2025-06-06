import csv
import json
import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import click
import orjsonl
import requests
import yaml


@dataclass
class Config:
    organism: str
    segmented: str
    nucleotide_sequences: list[str]
    slack_hook: str
    backend_url: str


logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)

# https://stackoverflow.com/questions/15063936
csv.field_size_limit(sys.maxsize)


def ids_to_add(fasta_id, config) -> set[str]:
    if config.segmented:
        return {
            fasta_id + "_" + nucleotideSequence
            for nucleotideSequence in config.nucleotide_sequences
        }
    return {fasta_id}


def notify(config: Config, text: str):
    """Send slack notification with revocation details"""
    if config.slack_hook:
        requests.post(config.slack_hook, data=json.dumps({"text": text}), timeout=10)
    logger.warn(text)


def revocation_notification(config: Config, to_revoke: dict[str, dict[str, str]]):
    """Send slack notification with revocation details"""
    text = (
        f"{config.backend_url}: Ingest pipeline wants to add the following sequences"
        f" which will lead to revocations: {to_revoke}. "
        "If you agree with this manually run the regroup_and_revoke cronjob:"
        f" `kubectl create job --from=cronjob/loculus-revoke-and-regroup-cronjob-{config.organism} "
        f"loculus-revoke-and-regroup-cronjob-{config.organism} -n <NAMESPACE>`."
    )
    notify(config, text)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--metadata-path", required=True, type=click.Path(exists=True))
@click.option("--sequences-path", required=False, type=click.Path(exists=True))
@click.option("--to-submit-path", required=True, type=click.Path(exists=True))
@click.option("--to-revise-path", required=True, type=click.Path(exists=True))
@click.option("--to-revoke-path", required=True, type=click.Path(exists=True))
@click.option("--sequences-submit-path", required=False, type=click.Path())
@click.option("--sequences-submit-prior-to-revoke-path", required=False, type=click.Path())
@click.option("--sequences-revise-path", required=False, type=click.Path())
@click.option("--metadata-submit-path", required=True, type=click.Path())
@click.option("--metadata-revise-path", required=True, type=click.Path())
@click.option("--metadata-submit-prior-to-revoke-path", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    config_file: str,
    metadata_path: str,
    sequences_path: str,
    to_submit_path: str,
    to_revise_path: str,
    to_revoke_path: str,
    sequences_submit_path: str,
    sequences_revise_path: str,
    sequences_submit_prior_to_revoke_path: str,
    metadata_submit_path: str,
    metadata_revise_path: str,
    metadata_submit_prior_to_revoke_path: str,
    log_level: str,
) -> None:
    logger = logging.getLogger(__name__)
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)

    to_submit = json.load(open(to_submit_path, encoding="utf-8"))
    to_revise = json.load(open(to_revise_path, encoding="utf-8"))
    to_revoke = json.load(open(to_revoke_path, encoding="utf-8"))

    submit_ids = set()
    revise_ids = set()
    submit_prior_to_revoke_ids = set()

    def write_to_tsv_stream(data, filename, columns_list=None):
        # Check if the file exists
        file_exists = os.path.exists(filename)

        with open(filename, "a", newline="", encoding="utf-8") as output_file:
            keys = columns_list or data.keys()
            dict_writer = csv.DictWriter(output_file, keys, delimiter="\t")

            # Write the header only if the file doesn't already exist
            if not file_exists:
                dict_writer.writeheader()

            dict_writer.writerow(data)

    columns_list = None
    found_seq_to_revoke = False
    for field in orjsonl.stream(metadata_path):
        fasta_id = field["id"]
        record = field["metadata"]
        if not columns_list:
            columns_list = record.keys()

        if fasta_id in to_submit:
            write_to_tsv_stream(record, metadata_submit_path, columns_list)
            submit_ids.update(ids_to_add(fasta_id, config))
            continue

        if fasta_id in to_revise:
            record["accession"] = to_revise[fasta_id]
            write_to_tsv_stream(record, metadata_revise_path, [*columns_list, "accession"])
            revise_ids.update(ids_to_add(fasta_id, config))
            continue

        if fasta_id in to_revoke:
            submit_prior_to_revoke_ids.update(ids_to_add(fasta_id, config))
            write_to_tsv_stream(record, metadata_submit_prior_to_revoke_path, columns_list)
            found_seq_to_revoke = True

    if found_seq_to_revoke:
        revocation_notification(config, to_revoke)

    def stream_filter_to_fasta(input, output, output_metadata, keep):
        if len(keep) == 0:
            Path(output).touch()
            Path(output_metadata).touch()
            return
        with open(output, "w", encoding="utf-8") as output_file:
            for record in orjsonl.stream(input):
                if record["id"] in keep:
                    output_file.write(f">{record['id']}\n{record['sequence']}\n")

    stream_filter_to_fasta(
        input=sequences_path,
        output=sequences_submit_path,
        output_metadata=metadata_submit_path,
        keep=submit_ids,
    )
    stream_filter_to_fasta(
        input=sequences_path,
        output=sequences_revise_path,
        output_metadata=metadata_revise_path,
        keep=revise_ids,
    )
    stream_filter_to_fasta(
        input=sequences_path,
        output=sequences_submit_prior_to_revoke_path,
        output_metadata=metadata_submit_prior_to_revoke_path,
        keep=submit_prior_to_revoke_ids,
    )


if __name__ == "__main__":
    main()
