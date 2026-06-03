"""Script to calculate hashes for metadata records and save them in a format suitable for submission to Loculus"""
import hashlib
import json
import logging
from dataclasses import dataclass

import click
import orjsonl
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
    segmented: bool
    nucleotide_sequences: list[str]


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    config_file: str,
    input: str,
    output: str,
    log_level: str,
) -> None:
    logger.setLevel(log_level)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.debug(config)

    count = 0

    # Calculate overall hash of metadata + sequence and add to record
    for record in orjsonl.stream(input):
        count += 1
        # Hash of all metadata fields should be the same if
        # 1. field is not in keys_to_keep and
        # 2. field is in keys_to_keep but is "" or None
        filtered_record = {k: str(v) for k, v in record.items() if v is not None and str(v)}

        # Sequence hash (of each segment)
        sequence_hash = ""
        if config.segmented:
            for segment in config.nucleotide_sequences:
                sequence_hash += record.get(f"hash_{segment}", "")
                filtered_record.pop(f"hash_{segment}", None)
        else:
            sequence_hash = record.get("hash", "")
            filtered_record.pop("hash", None)

        # rename "id" to "submissionId" for back-compatibility with old hashes
        filtered_record["submissionId"] = filtered_record.pop("id")
        filtered_record.pop("fastaIds", None)

        metadata_dump = json.dumps(filtered_record, sort_keys=True)
        prehash = metadata_dump + sequence_hash

        record["hash"] = hashlib.md5(prehash.encode(), usedforsecurity=False).hexdigest()

        orjsonl.append(output, {"id": record["id"], "metadata": record})

    logger.info(f"Calculated hashes for {count} sequences")


if __name__ == "__main__":
    main()
