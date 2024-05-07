import json
import logging
from collections import defaultdict
from hashlib import md5

import click

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)

def md5_float(string: str) -> float:
    """Turn a string randomly but stably into a float between 0 and 1"""
    return int(md5(string.encode()).hexdigest(), 16) / 16 ** 32


@click.command()
@click.option("--old-hashes", required=True, type=click.Path(exists=True))
@click.option("--metadata", required=True, type=click.Path(exists=True))
@click.option("--to-submit", required=True, type=click.Path())
@click.option("--to-revise", required=True, type=click.Path())
@click.option("--unchanged", required=True, type=click.Path())
@click.option("--output-blocked", required=True, type=click.Path())
@click.option("--subsample-fraction", required=True, type=float)
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    old_hashes: str,
    metadata: str,
    to_submit: str,
    to_revise: str,
    unchanged: str,
    output_blocked: str,
    subsample_fraction: float,
    log_level: str,
) -> None:
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    submitted: dict = json.load(open(old_hashes))
    new_metadata = json.load(open(metadata))

    # Sort all submitted versions by version number
    for _, loculus in submitted.items():
        # TODO: check sort order
        loculus["versions"] = sorted(loculus["versions"], key=lambda x: x["version"])

    submit = []  # INSDC accessions to submit
    revise = {}  # Mapping from INSDC accessions to loculus accession of sequences to revise
    noop = {}  # Mapping from INSDC accessions to equivalent loculus accession of sequences for which no action is needed
    blocked = defaultdict(
        dict
    )  # Mapping from INSDC accessions to equivalent loculus accession of sequences that cannot be updated due to status

    for fasta_id, record in new_metadata.items():
        try:
            insdc_accession_base = record["insdc_accession_base"]
            keep = md5_float(insdc_accession_base) <= subsample_fraction
            if not keep:
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
                        blocked[status][fasta_id] = submitted[insdc_accession_base]["loculus_accession"]
                else:
                    noop[fasta_id] = submitted[insdc_accession_base]["loculus_accession"]
        except Exception as e:
            logger.error(f"Error processing {fasta_id}, {submitted[insdc_accession_base]}: {e}")
            

    outputs = [
        (submit, to_submit, "Sequences to submit"),
        (revise, to_revise, "Sequences to revise"),
        (noop, unchanged, "Unchanged sequences"),
        (blocked, output_blocked, "Blocked sequences"),
    ]
    for value, path, text in outputs:
        with open(path, "w") as file:
            json.dump(value, file)
        logger.debug(f"{text}: {len(value)}")


if __name__ == "__main__":
    main()
