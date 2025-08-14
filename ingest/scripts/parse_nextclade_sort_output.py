"""
This script parses the results of nextclade sort:
 - keeps only the highest scoring hit for each sequence
 - parses the corresponding dataset name according to the minimizer_parser
 - creates an output tsv with the parsed dataset names and seqName columns
"""

import logging
from dataclasses import dataclass

import click
import pandas as pd
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass
class NextcladeSortParams:
    minimizer_index: str
    minimizer_parser: list[str]
    method: str = "minimizer"


@dataclass
class Config:
    segment_identification: NextcladeSortParams
    nucleotide_sequences: list[str]
    minimizer_index: str | None
    minimizer_parser: list[str] | None
    segmented: bool = False


def parse_file(
    config: NextcladeSortParams, sort_results: str, output_file: str, allowed_segments: list[str]
) -> None:
    df = pd.read_csv(sort_results, sep="\t", dtype={"index": "Int64"})

    no_rows = df.shape[0]

    # Drop rows where 'score' is NaN - i.e. no hits
    df["score"] = pd.to_numeric(df["score"], errors="coerce")
    df = df.dropna(subset=["score"])

    logger.info(f"Dropped {no_rows - df.shape[0]} sequences with no hits")

    # Group by 'index', then sort within each group by 'score' and keep the highest score
    df_sorted = df.sort_values(["index", "score"], ascending=[True, False])
    df_highest_per_group = df_sorted.drop_duplicates(subset="index", keep="first")

    df_highest_per_group = df_highest_per_group.copy()
    parts = df_highest_per_group["dataset"].astype(str).str.split("_", expand=True)
    for i, field in enumerate(config.minimizer_parser):
        df_highest_per_group.loc[:, field] = parts[i].fillna("")

    header = list(config.minimizer_parser)
    header.append("seqName")
    # Filter out rows where 'segment' is NOT in nucleotide_sequences
    # these cases are not explicitly supported by loculus
    filtered_df = df_highest_per_group[df_highest_per_group["segment"].isin(allowed_segments)]
    filtered_df.to_csv(output_file, columns=header, sep="\t", index=False)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--sort-results", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path(exists=False))
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(config_file: str, sort_results: str, output: str, log_level: str) -> None:
    logger.setLevel(log_level)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        if not relevant_config["segmented"]:
            relevant_config["segment_identification"] = NextcladeSortParams(
                relevant_config["minimizer_index"], relevant_config["minimizer_parser"]
            )
        else:
            relevant_config["segment_identification"] = NextcladeSortParams(
                **relevant_config["segment_identification"]
            )
        config = Config(**relevant_config)

    logger.info(f"Config: {config}")
    if "segment" not in config.segment_identification.minimizer_parser and config.segmented:
        error_msg = "minimizer_parser must include 'segment'"
        raise ValueError(error_msg)
    parse_file(
        config.segment_identification,
        sort_results,
        output,
        allowed_segments=config.nucleotide_sequences,
    )


if __name__ == "__main__":
    main()
