import json
import logging
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
    nucleotideSequences: list[str]
    debugHashes: bool = False


def md5_float(string: str) -> float:
    """Turn a string randomly but stably into a float between 0 and 1"""
    return int(md5(string.encode()).hexdigest(), 16) / 16**32


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--old-hashes", required=True, type=click.Path(exists=True))
@click.option("--metadata", required=True, type=click.Path(exists=True))
@click.option("--to-submit", required=True, type=click.Path())
@click.option("--to-revise", required=True, type=click.Path())
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
    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {
            key: full_config[key] for key in Config.__annotations__ if key in full_config
        }
        config = Config(**relevant_config)
    
    if debug_hashes:
        config.debugHashes = True

    submitted: dict = json.load(open(old_hashes))
    new_metadata = json.load(open(metadata))

    # Sort all submitted versions by version number
    for _, loculus in submitted.items():
        # TODO: check sort order
        loculus["versions"] = sorted(loculus["versions"], key=lambda x: x["version"])

    submit = []  # INSDC accessions to submit
    revise = {}  # Mapping from INSDC accessions to loculus accession of sequences to revise
    noop = {}  # Mapping for sequences for which no action is needed
    blocked = defaultdict(dict)  # Mapping for sequences that cannot be updated due to status
    sampled_out = []  # INSDC accessions that were sampled out
    hashes = []  # Hashes of all INSDC accessions, for debugging

    for fasta_id, record in new_metadata.items():
        if config.segmented:
            insdc_keys = [
                f"insdc_accession_base_{segment}" for segment in config.nucleotideSequences
            ]
        else:
            insdc_keys = ["insdc_accession_base"]
        has_insdc_key = any([record[key] is not None or record[key] != "" for key in insdc_keys])
        if has_insdc_key:
            insdc_accession_base = "".join(
                ["" if record[key] is None else record[key] for key in insdc_keys]
            )
            hash_float = md5_float(insdc_accession_base)
            if config.debugHashes:
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
                # logger.error(f"Error processing {fasta_id}, {submitted[insdc_accession_base]}: {e}")

    outputs = [
        (submit, to_submit, "Sequences to submit"),
        (revise, to_revise, "Sequences to revise"),
        (noop, unchanged, "Unchanged sequences"),
        (blocked, output_blocked, "Blocked sequences"),
        (sampled_out, sampled_out_file, "Sampled out sequences"),
    ]

    if config.debugHashes:
        outputs.append((hashes, "hashes.json", "Hashes"))

    for value, path, text in outputs:
        with open(path, "w") as file:
            json.dump(value, file)
        logger.debug(f"{text}: {len(value)}")


if __name__ == "__main__":
    main()
