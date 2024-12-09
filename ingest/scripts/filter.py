"""filters sequences by metadata fields"""

import logging
from dataclasses import dataclass

import click
import pandas as pd
import yaml
from Bio import SeqIO


@dataclass
class FilterObjects:
    name: str
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
    df = pd.read_csv(input_metadata, sep="\t", dtype=str, keep_default_na=False)
    for filter in config.filter:
        df = df[df[filter.name].str.contains(filter.value)]
    submission_ids = df["submissionId"].tolist()
    df.to_csv(output_metadata, sep="\t", index=False)
    if not config.segmented:
        with (
            open(input, encoding="utf-8") as f_in,
            open(output_seq, "a", encoding="utf-8") as f_out,
        ):
            records = SeqIO.parse(f_in, "fasta")
            for record in records:
                if record.id in submission_ids:
                    SeqIO.write(record, f_out, "fasta")
        return
    with (
        open(input, encoding="utf-8") as f_in,
        open(output_seq, "a", encoding="utf-8") as f_out,
    ):
        records = SeqIO.parse(f_in, "fasta")
        for record in records:
            if record.id.split("_")[:-1] in submission_ids:
                SeqIO.write(record, f_out, "fasta")
