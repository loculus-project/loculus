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
class Config:
    minimizer_index: str
    minimizer_parser: list[str]
    nucleotide_sequences: list[str]


def parse(field: str, index: int) -> str:
    return field.split("_")[index] if len(field.split("_")) > index else ""


def parse_file(config: Config, sort_results: str, output_file: str):
    df = pd.read_csv(sort_results, sep="\t", dtype={"index": "Int64"})

    no_rows = df.shape[0]

    # Drop rows where 'score' is NaN - i.e. no hits
    df["score"] = pd.to_numeric(df["score"], errors="coerce")
    df = df.dropna(subset=["score"])

    logger.info(f"Dropped {no_rows - df.shape[0]} sequences with no hits")

    # Group by 'index', then sort within each group by 'score' and keep the highest score
    df_sorted = df.sort_values(["index", "score"], ascending=[True, False])
    df_highest_per_group = df_sorted.drop_duplicates(subset="index", keep="first")

    for i, field in enumerate(config.minimizer_parser):
        df_highest_per_group[field] = df_highest_per_group.apply(
            lambda x: parse(x["dataset"], i), axis=1
        )
    header = list(config.minimizer_parser)
    header.append("seqName")
    df_highest_per_group.to_csv(output_file, columns=header, sep="\t", index=False)


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
        config = Config(**relevant_config)
    logger.info(f"Config: {config}")
    #TODO: throw an error if minimizer_index does not include segment
    parse_file(config, sort_results, output)


if __name__ == "__main__":
    main()
