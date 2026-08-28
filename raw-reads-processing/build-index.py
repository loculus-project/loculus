#!/usr/bin/env python3
"""Build a deacon index from PPX consensus sequences that pass nextclade QC.

For every organism configured on Pathoplexus, downloads the latest open,
unrevoked consensus sequences, runs nextclade to identify sequences with
qc.overallStatus == "good", and folds the good sequences into a deacon
index diffed against a base human/kdust-filtered index.
"""

import argparse
import csv
import logging
import subprocess  # noqa: S404
import sys
import tempfile
import urllib.parse
from pathlib import Path

import requests

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

csv.field_size_limit(sys.maxsize)

PATHOPLEXUS_URL = "https://pathoplexus.org"
LAPIS_URL = "https://lapis.pathoplexus.org"
BASE_INDEX_URL = (
    "https://objectstorage.uk-london-1.oraclecloud.com/n/lrbvkel2wjot/b/"
    "human-genome-bucket/o/deacon/misc/panhuman-1.k31w15c8.idx"
)

KMER_LEN = 31
WINDOW_SIZE = 15

REQUEST_TIMEOUT_SECONDS = 300


def fetch_loculus_info() -> dict:
    response = requests.get(
        f"{PATHOPLEXUS_URL}/loculus-info", timeout=REQUEST_TIMEOUT_SECONDS
    )
    response.raise_for_status()
    return response.json()


def nextclade_urls_for_organism(loculus_info: dict, organism: str) -> list[str]:
    schema = loculus_info["organisms"][organism]["schema"]
    return [
        link_out["url"]
        for link_out in schema.get("linkOuts") or []
        if "nextclade" in link_out.get("name", "").lower()
    ]


def download_organism_fasta(organism: str, dest: Path, tmp_dir: Path) -> None:
    url = (
        f"{LAPIS_URL}/{organism}/sample/unalignedNucleotideSequences"
        "?dataUseTerms=OPEN&dataFormat=fasta&versionStatus=LATEST_VERSION&isRevocation=false&compression=zstd"
    )
    zst_path = tmp_dir / f"{organism}.fasta.zst"
    with requests.get(url, stream=True, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        response.raise_for_status()
        with zst_path.open("wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)

    with dest.open("wb") as f:
        subprocess.run(["zstdcat", str(zst_path)], stdout=f, check=True)  # noqa: S603, S607


def download_base_index(dest: Path) -> None:
    with requests.get(
        BASE_INDEX_URL, stream=True, timeout=REQUEST_TIMEOUT_SECONDS
    ) as response:
        response.raise_for_status()
        with dest.open("wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)


def parse_dataset_params(url: str) -> tuple[str, str]:
    query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    dataset_name = query.get("dataset-name", [""])[0]
    dataset_server = query.get("dataset-server", [""])[0]
    return dataset_name, dataset_server


def run_nextclade(
    fasta_path: Path, dataset_name: str, dataset_server: str, out_dir: Path
) -> None:
    args = [
        "nextclade",
        "run",
        "--retry-reverse-complement=true",
        "--verbosity=error",
        "--output-tsv",
        str(out_dir / "nextclade.tsv"),
        "--dataset-name",
        dataset_name,
        "--jobs",
        "4",
    ]
    if dataset_server:
        args += ["--server", dataset_server]
    args += ["--", str(fasta_path)]

    logger.info("Running nextclade for dataset '%s'", dataset_name)
    subprocess.run(args, check=True)  # noqa: S603, S607


def good_sequence_names(tsv_path: Path) -> set[str]:
    """FASTA headers with qc.overallStatus == "good"."""
    with tsv_path.open(newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        return {
            row["seqName"] for row in reader if row.get("qc.overallStatus") == "good"
        }


def append_good_seq(
    fasta_path: Path, good_seq_names: set[str], combined_fasta: Path
) -> None:
    """Append only the FASTA records at `good_seq_names` to combined_fasta."""
    dropped = 0
    with fasta_path.open() as src, combined_fasta.open("a") as dst:
        keep = False
        for line in src:
            if line.startswith(">"):
                seq_name = line[1:].strip()
                keep = seq_name in good_seq_names
                if not keep:
                    dropped += 1
            if keep:
                dst.write(line)
        # Ensure records from separate files cannot run together.
        dst.write("\n")
    logger.info("Dropped %d sequences from %s", dropped, fasta_path.name)


def run_deacon_index_diff(
    temp_index: Path, combined_fasta: Path, output_path: Path
) -> None:
    args = [
        "deacon",
        "index",
        "diff",
        str(temp_index),
        str(combined_fasta),
        "-k",
        str(KMER_LEN),
        "-w",
        str(WINDOW_SIZE),
        "-o",
        str(output_path),
    ]
    subprocess.run(args, check=True)  # noqa: S603, S607


def build_index(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)
        temp_index = tmp_dir / "deacon_human_kdust_filtered.idx"
        combined_fasta = tmp_dir / "combined.fasta"
        combined_fasta.touch()

        logger.info("Downloading base index from %s...", BASE_INDEX_URL)
        download_base_index(temp_index)

        loculus_info = fetch_loculus_info()
        organisms = sorted(loculus_info["organisms"].keys())

        for organism in organisms:
            organism_fasta = tmp_dir / f"{organism}.fasta"
            logger.info("Downloading %s...", organism)
            download_organism_fasta(organism, organism_fasta, tmp_dir)

            if organism_fasta.stat().st_size == 0:
                logger.warning("Empty FASTA returned for %s; skipping.", organism)
                continue

            for url in nextclade_urls_for_organism(loculus_info, organism):
                dataset_name, dataset_server = parse_dataset_params(url)
                logger.info(
                    "dataset_name=%s dataset_server=%s", dataset_name, dataset_server
                )

                run_nextclade(organism_fasta, dataset_name, dataset_server, tmp_dir)

                logger.info("Filtering FASTA for good sequences...")
                good_seq_names = good_sequence_names(tmp_dir / "nextclade.tsv")
                logger.info(
                    "Found %d good sequences for %s", len(good_seq_names), organism
                )
                append_good_seq(organism_fasta, good_seq_names, combined_fasta)
            organism_fasta.unlink()

        run_deacon_index_diff(temp_index, combined_fasta, output_path)

    logger.info("Output written to: %s", output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-o", "--output", required=True, help="Output index path")
    args = parser.parse_args()

    build_index(Path(args.output))


if __name__ == "__main__":
    main()
