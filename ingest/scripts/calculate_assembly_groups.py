import json
import logging
import os
import pathlib
from collections import Counter
from dataclasses import dataclass

import click
import yaml
from Bio import SeqIO

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass(frozen=True)
class Config:
    nucleotide_sequences: list[str]
    segmented: bool
    organism: str


def calculate_assembly_groups(  # noqa: C901
    dataset_dir: list[str],
    ignore: set[str],
    config: Config,
) -> dict[str, list[str]]:
    assembly_segment_dict: dict[str, list[str]] = {}
    records = set()
    segment_count_counter = Counter()

    for dir in dataset_dir:
        for gca_folder in os.listdir(dir):
            gca_path = os.path.join(dir, gca_folder)
            if not os.path.isdir(gca_path):
                # The 'assembly_data_report.jsonl' and 'dataset_catalog.json' are also in the dir; skip.
                continue
            for file in os.listdir(gca_path):
                if not file.endswith(".fna"):
                    continue
                # Certain assemblies contain two files, one of which we want to ignore because it has CDS info
                # Examples: GCA_052462815.1, GCA_052463665.1, GCA_052463295.1, GCA_052464535.1
                if "cds_from_genomic" in file:
                    continue
                assembly_id = file.split(".")[0]
                if assembly_id in assembly_segment_dict:
                    msg = f"Duplicate assembly found: {assembly_id}"
                    logger.error(msg)
                    raise ValueError(msg)

                segments = []
                with open(os.path.join(gca_path, file), encoding="utf-8") as f:
                    segments = [
                        record.id for record in SeqIO.parse(f, "fasta") if record.id not in ignore
                    ]
                if set(segments) & records:
                    msg = f"Duplicate INSDC accessions found in assembly {assembly_id}"
                    logger.error(msg)
                    raise ValueError(msg)
                if len(segments) > len(config.nucleotide_sequences):
                    msg = (
                        f"Assembly {assembly_id} has more segments ({len(segments)}) "
                        f"than expected ({len(config.nucleotide_sequences)}), ignoring assembly."
                    )
                    logger.warning(msg)
                    continue
                segment_count_counter[len(segments)] += 1
                assembly_segment_dict[assembly_id] = segments
                records.update(segments)

    logger.info(f"Found {len(assembly_segment_dict)} assemblies")
    for segment_count in sorted(segment_count_counter):
        logger.info(
            f"Number of assemblies with {segment_count} segments: {segment_count_counter[segment_count]:7}"
        )
    return assembly_segment_dict


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option(
    "--dataset-dir",
    required=True,
    type=click.Path(exists=True),
    multiple=True,
    help=(
        "The dataset dir is the 'data' directory you get from an NCBI datasets download. "
        "It has individual directories inside, per assembly (named e.g. GCF_0002342342.1)."
    ),
)
@click.option(
    "--output-file",
    required=True,
    type=click.Path(exists=False),
    help="The file to be generated, containing the groupings in JSON format.",
)
@click.option(
    "--ignore-list",
    required=True,
    type=click.Path(exists=False),
    help="A file with one segment ID per line to be ignored.",
)
def main(config_file: str, dataset_dir: list[str], output_file: str, ignore_list: str) -> None:
    full_config = yaml.safe_load(pathlib.Path(config_file).read_text(encoding="utf-8"))
    relevant_config = {key: full_config[key] for key in Config.__annotations__}
    config = Config(**relevant_config)

    if not config.segmented:
        raise ValueError({"ERROR: You are running a function that was built for segmented data"})

    with open(ignore_list, encoding="utf-8") as file:
        ignore = [line.strip() for line in file]
    logger.info(f"Ignoring {len(ignore)} segments")

    assembly_segment_dict = calculate_assembly_groups(
        dataset_dir=dataset_dir,
        ignore=set(ignore),
        config=config,
    )

    with open(output_file, "w", encoding="utf-8") as outfile:
        json.dump(assembly_segment_dict, outfile, indent=4)


if __name__ == "__main__":
    main()
