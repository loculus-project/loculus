import csv
import json
from dataclasses import dataclass

import click
import yaml


@dataclass
class Config:
    simple_mappings: dict[str, str]
    location_mappings: dict[str, str]
    submitter_mappings: dict[str, str]
    isolate_mappings: dict[str, str]
    last_virus_lineage_mappings: dict[str, str]
    last_host_lineage_mappings: dict[str, str]
    unknown_mappings: list[str]


def extract_fields(row, config: Config) -> dict:
    try:
        extracted = {}
        extracted.update({key: row.get(value) for key, value in config.simple_mappings.items()})

        location = row.get("location", {})
        extracted.update(
            {key: location.get(value) for key, value in config.location_mappings.items()}
        )

        submitter = row.get("submitter", {})
        extracted.update(
            {key: submitter.get(value) for key, value in config.submitter_mappings.items()}
        )

        isolate = row.get("isolate", {})
        extracted.update(
            {key: isolate.get(value) for key, value in config.isolate_mappings.items()}
        )

        host_lineage = row.get("host", {}).get("lineage", [])
        last_host_lineage = host_lineage[-1] if host_lineage else {}
        extracted.update(
            {
                key: last_host_lineage.get(value)
                for key, value in config.last_host_lineage_mappings.items()
            }
        )

        virus_lineage = row.get("virus", {}).get("lineage", [])
        last_virus_lineage = virus_lineage[-1] if virus_lineage else {}
        extracted.update(
            {
                key: last_virus_lineage.get(value)
                for key, value in config.last_virus_lineage_mappings.items()
            }
        )

        extracted.update(dict.fromkeys(config.unknown_mappings))

    except KeyError as e:
        print(f"Missing key: {e}")
        extracted = {}

    return extracted


def jsonl_to_tsv(jsonl_file: str, tsv_file: str, config: Config) -> None:
    with (
        open(jsonl_file, encoding="utf-8") as infile,
        open(tsv_file, "w", newline="", encoding="utf-8") as outfile,
    ):
        fieldnames = (
            list(config.simple_mappings.keys())
            + list(config.location_mappings.keys())
            + list(config.submitter_mappings.keys())
            + list(config.isolate_mappings.keys())
            + list(config.last_virus_lineage_mappings.keys())
            + list(config.last_host_lineage_mappings.keys())
            + list(config.unknown_mappings)
        )
        writer = csv.DictWriter(
            outfile,
            fieldnames=fieldnames,
            delimiter="\t",
        )

        writer.writeheader()

        for line in infile:
            row = json.loads(line.strip())
            extracted = extract_fields(row, config)
            writer.writerow(extracted)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path())
def main(config_file: str, input: str, output: str) -> None:
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)
    jsonl_to_tsv(input, output, config=config)


if __name__ == "__main__":
    main()
