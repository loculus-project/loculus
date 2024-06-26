import csv
import os
import pandas as pd
import logging
import sys
from dataclasses import dataclass

import click


@dataclass
class Config:
    segmented: str
    nucleotide_sequences: list[str]


logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)

# https://stackoverflow.com/questions/15063936
csv.field_size_limit(sys.maxsize)


def validate_paths(ctx, param, value):
    """Custom validation function to check if all provided paths exist."""
    paths = value.split(" ")  # Assuming paths are comma-separated
    for path in paths:
        if not os.path.exists(path):
            msg = f"Path does not exist: {path}"
            raise click.BadParameter(msg)
    return paths


@click.command()
@click.option(
    "--input",
    required=True,
    callback=validate_paths,
    help="List of paths to alignment files.",
)
@click.option("--output", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    input: str,
    output: str,
    log_level: str,
) -> None:
    logger.setLevel(log_level)

    appended_df = pd.DataFrame({"seqName": [], "clade": []})

    for alignment_path in input:
        df = pd.read_csv(alignment_path, sep="\t", dtype=str)
        seq_clade = df[["seqName", "clade"]]
        # drop all rows that do not contain a clade - i.e. did not align to a segment
        seq_clade = seq_clade.dropna(subset=["clade"])
        appended_df = appended_df._append(seq_clade, ignore_index=True)

    # saving as tsv file
    appended_df.to_csv(output, sep="\t", index=False)


if __name__ == "__main__":
    main()
