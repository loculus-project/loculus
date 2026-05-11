"""Merge multiple ingest grouping override JSON files."""

from __future__ import annotations

import json
import logging
import pathlib

import click
import requests
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


def notify(slack_hook: str, text: str) -> None:
    """Send slack notification with text."""
    logger.warning(text)
    if not slack_hook:
        return
    try:
        requests.post(slack_hook, data=json.dumps({"text": text}), timeout=10)
    except Exception as exc:  # noqa: BLE001
        logger.error(f"Failed to send Slack notification: {exc}")


def merge_group_overrides(group_files: list[str]) -> dict[str, list[str]]:
    merged_groups: dict[str, list[str]] = {}
    accession_to_group: dict[str, str] = {}

    for group_file in group_files:
        with open(group_file, encoding="utf-8") as file:
            groups: dict[str, list[str]] = json.load(file)

        for group_name, accessions in groups.items():
            if group_name in merged_groups:
                if set(merged_groups[group_name]) == set(accessions):
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
            accession_to_group.update(dict.fromkeys(accessions, group_name))

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
@click.option(
    "--config-file",
    required=False,
    type=click.Path(exists=True),
    help="Path to ingest config YAML; used to read slack_hook and organism for failure alerts.",
)
def main(group_files: list[str], output_file: str, config_file: str | None) -> None:
    slack_hook = ""
    organism = ""
    if config_file:
        config = yaml.safe_load(pathlib.Path(config_file).read_text(encoding="utf-8")) or {}
        slack_hook = config.get("slack_hook") or ""
        organism = config.get("organism") or ""

    try:
        merged_groups = merge_group_overrides(list(group_files))
    except ValueError as exc:
        organism_prefix = f"Ingest for {organism}: " if organism else "Ingest: "
        notify(
            slack_hook,
            f"{organism_prefix}merge_group_overrides failed: {exc}. "
            "Ingest will not be able to run until the conflicting override files are fixed.",
        )
        raise

    output_path = pathlib.Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(merged_groups, indent=4) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
