import json
import logging
import operator
from collections import defaultdict
from dataclasses import dataclass
from hashlib import md5

import click
import requests
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass
class Config:
    segmented: str
    nucleotide_sequences: list[str]
    debug_hashes: bool = False
    slack_hook: str = ""


def notify(config: Config, text: str):
    """Send slack notification with blocked revision details"""
    if config.slack_hook:
        requests.post(config.slack_hook, data=json.dumps({"text": text}), timeout=10)
    logger.warn(text)


def get_changed_fields(curated_data, pre_curated_data):
    added = [k for k in curated_data if k not in pre_curated_data]
    removed = [k for k in pre_curated_data if k not in curated_data]
    modified = [
        k for k in pre_curated_data if k in curated_data and pre_curated_data[k] != curated_data[k]
    ]
    return set(added + removed + modified)


def handle_curation(record, sorted_versions):
    submitter_list = [sorted_version["submitter"] for sorted_version in sorted_versions]
    curated_metadata_fields: set = {}
    for index, submitter in enumerate(submitter_list):
        if submitter != "insdc_ingest_user":
            curated_data = sorted_versions[index]["original_metadata"]
            pre_curated_data = sorted_versions[index - 1]["original_metadata"]
            curated_metadata_fields.add(get_changed_fields(curated_data, pre_curated_data))
    new_changed_metadata_fields = get_changed_fields(
        record, sorted_versions[-1]["original_metadata"]
    )
    if new_changed_metadata_fields.isdisjoint(curated_metadata_fields):
        logger.info("Sequence has been curated before but in different fields - can be revised")
        # Add to revise - with curation info to overwrite record
    else:
        logger.info(
            "Sequence has been curated before but in overlapping fields - cannot be revised automatically"
        )
        # notify(config, f"Sequence {record['insdcAccessionBase']} has been curated before")
        # Add to blocked - with curation info to overwrite record


def md5_float(string: str) -> float:
    """Turn a string randomly but stably into a float between 0 and 1"""
    return int(md5(string.encode(), usedforsecurity=False).hexdigest(), 16) / 16**32


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--old-hashes", required=True, type=click.Path(exists=True))
@click.option("--metadata", required=True, type=click.Path(exists=True))
@click.option("--to-submit", required=True, type=click.Path())
@click.option("--to-revise", required=True, type=click.Path())
@click.option("--to-revoke", required=True, type=click.Path())
@click.option("--unchanged", required=True, type=click.Path())
@click.option("--sampled-out-file", required=True, type=click.Path())
@click.option("--output-blocked", required=True, type=click.Path())
@click.option("--subsample-fraction", required=True, type=float)
@click.option("--debug-hashes", is_flag=True, default=False)
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    config_file: str,
    old_hashes: str,
    metadata: str,
    to_submit: str,
    to_revise: str,
    to_revoke: str,
    unchanged: str,
    output_blocked: str,
    sampled_out_file: str,
    subsample_fraction: float,
    debug_hashes: bool,
    log_level: str,
) -> None:
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {
            key: full_config[key] for key in Config.__annotations__ if key in full_config
        }
        config = Config(**relevant_config)

    if debug_hashes:
        config.debug_hashes = True

    submitted: dict = json.load(open(old_hashes, encoding="utf-8"))
    new_metadata = json.load(open(metadata, encoding="utf-8"))

    # Sort all submitted versions by version number
    for _, loculus in submitted.items():
        # TODO: check sort order
        loculus["versions"] = sorted(loculus["versions"], key=operator.itemgetter("version"))

    submit = []  # INSDC accessions to submit
    revise = {}  # Mapping from INSDC accessions to loculus accession of sequences to revise
    noop = {}  # Mapping for sequences for which no action is needed
    blocked = defaultdict(dict)  # Mapping for sequences that cannot be updated due to status
    sampled_out = []  # INSDC accessions that were sampled out
    hashes = []  # Hashes of all INSDC accessions, for debugging
    # TODO: Update revoke to map from new joint insdc accessions to old loculus accessions and curated fields that need to be used to overwrite data received from INSDC
    revoke = {}  # Map of new grouping joint insdc accessions to map of previous state
    # i.e. loculus accessions (to be revoked) and their corresponding old joint insdc accessions

    for fasta_id, record in new_metadata.items():
        if not config.segmented:
            insdc_accession_base = record["insdcAccessionBase"]
            if not insdc_accession_base:
                msg = "Ingested sequences without INSDC accession base - potential internal error"
                raise ValueError(msg)
            hash_float = md5_float(insdc_accession_base)
            if config.debug_hashes:
                hashes.append(hash_float)
            keep = hash_float <= subsample_fraction
            if not keep:
                sampled_out.append({fasta_id: insdc_accession_base, "hash": hash_float})
                continue
            if insdc_accession_base not in submitted:
                submit.append(fasta_id)
            else:
                sorted_versions = sorted(
                    submitted[insdc_accession_base]["versions"], key=lambda x: x["version"]
                )
                latest = sorted_versions[-1]
                if latest["hash"] != record["hash"]:
                    if {sorted_version["submitter"] for sorted_version in sorted_versions} != {
                        "insdc_ingest_user"
                    }:
                        # Sequence has been curated before - special case
                        handle_curation(record, sorted_versions, revise, blocked)
                        continue
                    status = latest["status"]
                    if status == "APPROVED_FOR_RELEASE":
                        revise[fasta_id] = submitted[insdc_accession_base]["loculus_accession"]
                    else:
                        blocked[status][fasta_id] = submitted[insdc_accession_base][
                            "loculus_accession"
                        ]
                else:
                    noop[fasta_id] = submitted[insdc_accession_base]["loculus_accession"]
            continue

        insdc_keys = [f"insdcAccessionBase_{segment}" for segment in config.nucleotide_sequences]
        insdc_accession_base_list = [record[key] for key in insdc_keys if record[key]]
        if len(insdc_accession_base_list) == 0:
            msg = (
                "Ingested multi-segmented sequences without INSDC accession base(s) "
                "- potential internal error"
            )
            raise ValueError(msg)
        insdc_accession_base = "/".join(
            [
                f"{record[key]}.{segment}"
                for key, segment in zip(insdc_keys, config.nucleotide_sequences)
                if record[key]
            ]
        )
        hash_float = md5_float(insdc_accession_base)
        if config.debug_hashes:
            hashes.append(hash_float)
        keep = hash_float <= subsample_fraction
        if not keep:
            sampled_out.append({fasta_id: insdc_accession_base, "hash": hash_float})
            continue
        if all(accession not in submitted for accession in insdc_accession_base_list):
            submit.append(fasta_id)
            continue
        if all(accession in submitted for accession in insdc_accession_base_list) and all(
            submitted[accession]["jointAccession"] == insdc_accession_base
            for accession in insdc_accession_base_list
        ):
            # grouping is the same, can just look at first segment in group
            accession = insdc_accession_base_list[0]
            sorted_versions = sorted(submitted[accession]["versions"], key=lambda x: x["version"])
            latest = sorted_versions[-1]
            if latest["hash"] != record["hash"]:
                if {sorted_version["submitter"] for sorted_version in sorted_versions} != {
                    "insdc_ingest_user"
                }:
                    # Sequence has been curated before - special case
                    handle_curation(record, sorted_versions, revise, blocked)
                    continue
                # Sequence has not been curated before - standard revision
                status = latest["status"]
                if status == "APPROVED_FOR_RELEASE":
                    revise[fasta_id] = submitted[accession]["loculus_accession"]
                else:
                    blocked[status][fasta_id] = submitted[accession]["loculus_accession"]
                status = latest["status"]
            else:
                noop[fasta_id] = submitted[accession]["loculus_accession"]
            continue
        old_accessions = {}
        for accession in insdc_accession_base_list:
            if accession in submitted:
                old_accessions[submitted[accession]["loculus_accession"]] = submitted[accession][
                    "jointAccession"
                ]
                # TODO: Figure out how to check for curation when regrouping - maybe just notify
        logger.warn(
            "Grouping has changed. Ingest would like to group INSDC samples:"
            f"{insdc_accession_base}, however these were previously grouped as {old_accessions}"
        )
        revoke[fasta_id] = old_accessions

    outputs = [
        (submit, to_submit, "Sequences to submit"),
        (revise, to_revise, "Sequences to revise"),
        (noop, unchanged, "Unchanged sequences"),
        (blocked, output_blocked, "Blocked sequences"),
        (sampled_out, sampled_out_file, "Sampled out sequences"),
        (revoke, to_revoke, "Sequences to revoke"),
    ]

    if config.debug_hashes:
        outputs.append((hashes, "hashes.json", "Hashes"))

    for value, path, text in outputs:
        with open(path, "w", encoding="utf-8") as file:
            json.dump(value, file)
        logger.info(f"{text}: {len(value)}")


if __name__ == "__main__":
    main()
