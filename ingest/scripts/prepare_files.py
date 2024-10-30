import csv
import json
import logging
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
        f" `kubectl create job --from=cronjob/loculus-revoke-and-regroup-cronjob-{config.organism} <manual-job-name>`."
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

    metadata = json.load(open(metadata_path, encoding="utf-8"))
    to_submit = json.load(open(to_submit_path, encoding="utf-8"))
    to_revise = json.load(open(to_revise_path, encoding="utf-8"))
    to_revoke = json.load(open(to_revoke_path, encoding="utf-8"))

    metadata_submit = []
    metadata_revise = []
    metadata_submit_prior_to_revoke = []  # Only for multi-segmented case, sequences are revoked
    # due to grouping changes and the newly grouped segments must be submitted as new sequences
    submit_ids = set()
    revise_ids = set()
    submit_prior_to_revoke_ids = set()

    for fasta_id in to_submit:
        metadata_submit.append(metadata[fasta_id])
        submit_ids.update(ids_to_add(fasta_id, config))

    for fasta_id, value in to_revise.items():
        loculus_accession = value["loculus_accession"]
        curated_fields = value["curated_fields"]
        revise_record = metadata[fasta_id]
        for field, curated_value in curated_fields.items():
            revise_record[field] = curated_value
        revise_record["accession"] = loculus_accession
        metadata_revise.append(revise_record)
        revise_ids.update(ids_to_add(fasta_id, config))

    found_seq_to_revoke = False
    for fasta_id in to_revoke:
        metadata_submit_prior_to_revoke.append(metadata[fasta_id])
        submit_prior_to_revoke_ids.update(ids_to_add(fasta_id, config))

    if found_seq_to_revoke:
        revocation_notification(config, to_revoke)

    def write_to_tsv(data, filename):
        if not data:
            Path(filename).touch()
            return
        keys = data[0].keys()
        with open(filename, "w", newline="", encoding="utf-8") as output_file:
            dict_writer = csv.DictWriter(output_file, keys, delimiter="\t")
            dict_writer.writeheader()
            dict_writer.writerows(data)

    write_to_tsv(metadata_submit, metadata_submit_path)
    write_to_tsv(metadata_revise, metadata_revise_path)
    write_to_tsv(metadata_submit_prior_to_revoke, metadata_submit_prior_to_revoke_path)

    def stream_filter_to_fasta(input, output, keep):
        if len(keep) == 0:
            Path(output).touch()
            return
        with open(output, "w", encoding="utf-8") as output_file:
            for record in orjsonl.stream(input):
                if record["id"] in keep:
                    output_file.write(f">{record['id']}\n{record['sequence']}\n")

    stream_filter_to_fasta(input=sequences_path, output=sequences_submit_path, keep=submit_ids)
    stream_filter_to_fasta(input=sequences_path, output=sequences_revise_path, keep=revise_ids)
    stream_filter_to_fasta(
        input=sequences_path,
        output=sequences_submit_prior_to_revoke_path,
        keep=submit_prior_to_revoke_ids,
    )


if __name__ == "__main__":
    main()
