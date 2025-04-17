"""
This script parses the results of nextclade alignments to multiple references:
 - joins results of all alignments
 - removes rows where there is no alignmentScore (i.e. alignment failed)
 - group by seqName (=accession) and alignmentScore and keep the row with the highest score
"""

import click
import pandas as pd


def parse_files(input_files: list[str], output_file: str):
    all_dfs = [pd.read_csv(file, sep="\t") for file in input_files]
    for i in range(len(input_files)):
        all_dfs[i]["segment"] = input_files[i].split("_")[-1].split(".")[0]
    df_combined = pd.concat(
        all_dfs, ignore_index=True
    )

    df_combined = df_combined.dropna(subset=["alignmentScore"])
    df_sorted = df_combined.sort_values(by=["seqName", "alignmentScore"], ascending=[True, False])

    # Keep the top (highest score) row per seqName
    df_top = df_sorted.drop_duplicates(subset="seqName", keep="first")

    df_top = df_top[["seqName", "segment"]]
    df_top.to_csv(output_file, sep="\t", index=False)


@click.command()
@click.option(
    "--alignment-results",
    required=True,
    type=click.Path(exists=True),
    multiple=True,
)
@click.option("--output", required=True, type=click.Path(exists=False))
def main(alignment_results: list[str], output: str) -> None:

    parse_files(alignment_results, output)


if __name__ == "__main__":
    main()
