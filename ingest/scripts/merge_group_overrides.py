"""Merge multiple ingest grouping override JSON files."""

from __future__ import annotations

import json
import pathlib

import click


def merge_group_overrides(group_files: list[str]) -> dict[str, list[str]]:
    merged_groups: dict[str, list[str]] = {}
    accession_to_group: dict[str, str] = {}

    for group_file in group_files:
        with open(group_file, encoding="utf-8") as file:
            groups: dict[str, list[str]] = json.load(file)

        for group_name, accessions in groups.items():
            if group_name in merged_groups:
                if merged_groups[group_name] == accessions:
                    continue
                msg = f"Group name {group_name!r} is defined differently in multiple override files"
                raise ValueError(msg)

            duplicated_accessions = sorted(
                accession for accession in accessions if accession in accession_to_group
            )
            if duplicated_accessions:
                existing_groups = {
                    accession: accession_to_group[accession] for accession in duplicated_accessions
                }
                msg = (
                    f"Accessions in group {group_name!r} already appear in other override groups: "
                    f"{existing_groups}"
                )
                raise ValueError(msg)

            merged_groups[group_name] = accessions
            accession_to_group.update({accession: group_name for accession in accessions})

    return merged_groups


@click.command()
@click.option(
    "--groups",
    "group_files",
    required=True,
    multiple=True,
    type=click.Path(exists=True),
    help="Grouping override JSON file to merge. Can be provided multiple times.",
)
@click.option("--output-file", required=True, type=click.Path())
def main(group_files: list[str], output_file: str) -> None:
    merged_groups = merge_group_overrides(list(group_files))
    output_path = pathlib.Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(merged_groups, indent=4) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
