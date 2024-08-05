import json
import logging
import operator
from collections import defaultdict
from dataclasses import dataclass
from hashlib import md5

import click
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
    revoke = {}  # Map of new grouping accessions to map of previous state
    # i.e. loculus accessions (to be revoked) and their corresponding old joint_accession

    for fasta_id, record in new_metadata.items():
        if not config.segmented:
            insdc_accession_base = record["insdc_accession_base"]
            if not insdc_accession_base:
                continue
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
                latest = submitted[insdc_accession_base]["versions"][-1]
                if latest["hash"] != record["hash"]:
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

        insdc_keys = [f"insdc_accession_base_{segment}" for segment in config.nucleotide_sequences]
        insdc_accession_base_list = [record[key] for key in insdc_keys if record[key]]
        if len(insdc_accession_base_list) == 0:
            continue
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
            submitted[accession]["joint_accession"] == insdc_accession_base
            for accession in insdc_accession_base_list
        ):
            # grouping is the same, can just look at first segment in group
            accession = insdc_accession_base_list[0]
            latest = submitted[accession]["versions"][-1]
            if latest["hash"] != record["hash"]:
                status = latest["status"]
                if status == "APPROVED_FOR_RELEASE":
                    revise[fasta_id] = submitted[accession]["loculus_accession"]
                else:
                    blocked[status][fasta_id] = submitted[accession]["loculus_accession"]
            else:
                noop[fasta_id] = submitted[accession]["loculus_accession"]
            continue
        for accession in insdc_accession_base_list:
            old_accessions = {}
            if accession in submitted:
                old_accessions[submitted[accession]["loculus_accession"]] = submitted[accession][
                    "joint_accession"
                ]
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
