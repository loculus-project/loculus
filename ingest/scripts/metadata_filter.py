"""filters sequences by metadata fields"""

import logging
from dataclasses import dataclass

import click
import orjsonl
import yaml


@dataclass
class Config:
    metadata_filter: dict[str, str]
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
    for record in orjsonl.stream(input): # type: ignore
        if not isinstance(record, dict):
            error = f"Expected a dict, got {type(record)} in {input}"
            raise TypeError(error)
        if (not config.segmented and record["id"] in keep) or (
            config.segmented and "_".join(record["id"].split("_")[:-1]) in keep
        ):
            orjsonl.append(output, record) # type: ignore


@click.command(help="Parse metadata and filter sequences based on config.filter values")
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

    logger.info(f"Filtering metadata with {config.metadata_filter}")
    submission_ids = set()
    count = 0
    for record in orjsonl.stream(input_metadata): # type: ignore
        if not isinstance(record, dict):
            error = f"Expected a dict, got {type(record)} in {input_metadata}"
            raise TypeError(error)
        row = record["metadata"]
        accession = record["id"]
        count += 1
        if all(row[key] == value for key, value in config.metadata_filter.items()):
            orjsonl.append(output_metadata, record) # type: ignore
            submission_ids.add(accession)

    logger.info(f"Filtered out {count - len(submission_ids)} entries")
    logger.info(f"Filtered metadata has {len(submission_ids)} entries")
    stream_filter_to_fasta(input=input_seq, output=output_seq, keep=submission_ids, config=config)


if __name__ == "__main__":
    main()
