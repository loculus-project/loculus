"""filters sequences by metadata fields"""

import json
import logging
from dataclasses import dataclass

import click
import yaml
import orjsonl


@dataclass
class FilterObjects:
    key: str
    value: str | int


@dataclass
class Config:
    filter: list[FilterObjects]
    nucleotide_sequences: list[str]
    segmented: bool


logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


def stream_filter_to_fasta(input, output, keep, config: Config):
    for record in orjsonl.stream(input):
        if (not config.segmented and record["id"] in keep) or (
            config.segmented and "".join(record["id"].split("_")[:-1]) in keep
        ):
            orjsonl.append(output, record)


@click.command(help="Parse fasta header, only keep if fits regex filter_fasta_headers")
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input-seq", required=True, type=click.Path(exists=True))
@click.option("--output-seq", required=True, type=click.Path())
@click.option("--input-metadata", required=True, type=click.Path(exists=True))
@click.option("--output-metadata", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    config_file: str,
    input_seq: str,
    output_seq: str,
    input_metadata: str,
    output_metadata: str,
    log_level: str,
) -> None:
    logger.setLevel(log_level)
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)
        config.filter = [FilterObjects(**filter) for filter in config.filter]
    metadata = json.load(open(input_metadata))
    logger.info(f"Filtering metadata with {config.filter}")
    metadata_filtered: dict = {}
    for accession, row in metadata.items():
        if all(row[filter.key] == filter.value for filter in config.filter):
            metadata_filtered[accession] = row
    submission_ids = metadata_filtered.keys()

    logger.info(f"Filtered out {len(metadata.keys()) - len(submission_ids)} entries")
    logger.info(f"Filtered metadata has {len(submission_ids)} entries")
    with open(output_metadata, "w", encoding="utf-8") as outfile:
        json.dump(metadata_filtered, outfile)
    stream_filter_to_fasta(input=input_seq, output=output_seq, keep=submission_ids, config=config)


if __name__ == "__main__":
    main()
