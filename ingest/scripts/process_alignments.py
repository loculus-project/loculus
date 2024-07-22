import csv
import os
import pandas as pd
import logging
import sys

import click


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
    paths = value.split(" ")
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
        seq_clade = df[["seqName", "qc.overallStatus"]]
        # drop all rows that do not contain a qc.overallStatus - i.e. did not align to a segment
        seq_clade = seq_clade.dropna(subset=["qc.overallStatus"])
        segment_name = (alignment_path.split(".")[-2]).split("_")[-1]
        seq_clade_named = seq_clade[["seqName"]]
        seq_clade_named["clade"] = segment_name
        appended_df = appended_df._append(seq_clade_named, ignore_index=True)

    # saving as tsv file
    appended_df.to_csv(output, sep="\t", index=False)
    logging.info(f"Kept {len(appended_df.index)} sequences where segment assignment was possible.")


if __name__ == "__main__":
    main()
