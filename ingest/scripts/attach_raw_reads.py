"""Attach links to raw reads hosted at ENA to ingested sequence entries.

Runs are matched to entries by the run accessions NCBI lists for the assembly or, if there are
none, by BioSample. Only links are attached: the FASTQ files stay at ENA and are registered with
the backend as external files at submission time (see `loculus_client.resolve_external_files`).
"""

import csv
import hashlib
import json
import logging
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import click
import orjsonl
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)

csv.field_size_limit(sys.maxsize)

# ENA reports this when the submitter did not specify an instrument, which Loculus does not accept
UNSPECIFIED_INSTRUMENT = "unspecified"
ENA_FILE_URL_SCHEME = "https://"


@dataclass
class Config:
    raw_reads_file_category: str
    raw_reads_accession_field: str
    biosample_field: str
    sequencing_instrument_field: str


@dataclass(frozen=True)
class ReadFile:
    name: str
    url: str
    size: int | None
    md5: str


@dataclass(frozen=True)
class Run:
    accession: str
    sample_accession: str
    instrument_model: str
    base_count: int
    files: tuple[ReadFile, ...]


def parse_read_files(row: dict[str, str]) -> tuple[ReadFile, ...]:
    """Return the FASTQ files of a run that can be submitted to Loculus.

    For paired runs ENA provides `<run>_1.fastq.gz` and `<run>_2.fastq.gz`, sometimes alongside
    `<run>.fastq.gz` holding reads whose mate was lost. Loculus accepts one (single-end) or two
    (paired-end) files, so the unpaired file is dropped. Runs that fit neither are skipped.
    """
    urls = [url for url in row["fastq_ftp"].split(";") if url]
    sizes = row["fastq_bytes"].split(";")
    md5s = row["fastq_md5"].split(";")
    if not urls or len(sizes) != len(urls) or len(md5s) != len(urls):
        return ()
    files = [
        ReadFile(
            name=url.rsplit("/", 1)[-1],
            url=ENA_FILE_URL_SCHEME + url,
            size=int(size) if size else None,
            md5=md5,
        )
        for url, size, md5 in zip(urls, sizes, md5s, strict=True)
    ]
    run = row["run_accession"]
    paired = tuple(f for f in files if f.name in {f"{run}_1.fastq.gz", f"{run}_2.fastq.gz"})
    if len(paired) == 2:  # noqa: PLR2004
        return tuple(sorted(paired, key=lambda f: f.name))
    if len(files) == 1:
        return tuple(files)
    return ()


def load_runs(runs_path: str, excluded_run_accessions: set[str]) -> dict[str, Run]:
    """Load the runs that can be attached, keyed by run accession."""
    runs: dict[str, Run] = {}
    skipped: defaultdict[str, int] = defaultdict(int)
    with open(runs_path, encoding="utf-8") as file:
        for row in csv.DictReader(file, delimiter="\t"):
            if row["run_accession"] in excluded_run_accessions:
                skipped["deposited by Loculus"] += 1
                continue
            instrument_model = row["instrument_model"].strip()
            if not instrument_model or instrument_model.lower() == UNSPECIFIED_INSTRUMENT:
                skipped["unspecified instrument"] += 1
                continue
            files = parse_read_files(row)
            if not files:
                skipped["no single or paired FASTQ files"] += 1
                continue
            runs[row["run_accession"]] = Run(
                accession=row["run_accession"],
                sample_accession=row["sample_accession"],
                instrument_model=instrument_model,
                base_count=int(row["base_count"] or 0),
                files=files,
            )
    logger.info(f"Loaded {len(runs)} attachable runs, skipped: {dict(skipped)}")
    return runs


def listed_run_accessions(record: dict[str, str], config: Config) -> list[str]:
    """Run accessions that INSDC lists for the entry, in all (possibly per-segment) fields."""
    field = config.raw_reads_accession_field
    values = [value for key, value in record.items() if key == field or key.startswith(f"{field}_")]
    return [
        accession.strip() for value in values for accession in value.split(",") if accession.strip()
    ]


def select_run(
    record: dict[str, str],
    runs: dict[str, Run],
    runs_by_sample: dict[str, list[Run]],
    config: Config,
) -> tuple[Run | None, str]:
    """Select the run to attach to an entry and return it with how it was matched.

    Run accessions listed by INSDC take precedence. Only if there are none are runs of the
    entry's BioSample considered, as a BioSample can have runs that were not used for the assembly.
    Among several candidates, the run with the most bases is chosen.
    """
    listed = listed_run_accessions(record, config)
    if listed:
        candidates = [runs[accession] for accession in listed if accession in runs]
        matched_by = "run accession"
    else:
        biosample = record.get(config.biosample_field, "").strip()
        candidates = runs_by_sample.get(biosample, []) if biosample else []
        matched_by = "biosample"
    if not candidates:
        return None, "none"
    return max(candidates, key=lambda run: (run.base_count, run.accession)), matched_by


def attach_run(record: dict[str, str], run: Run | None, config: Config) -> None:
    """Add the run's files to the record and update its hash so that changes trigger a revision.

    Records without a run keep their hash, so that enabling raw reads ingest only revises entries
    that actually gain raw reads.
    """
    file_column = f"files.{config.raw_reads_file_category}"
    record[file_column] = ""
    record.setdefault(config.sequencing_instrument_field, "")
    if run is None:
        return

    record[file_column] = json.dumps(
        [{"name": f.name, "url": f.url, "size": f.size} for f in run.files]
    )
    if not record[config.sequencing_instrument_field]:
        record[config.sequencing_instrument_field] = run.instrument_model
    # Only fill the accession field if it is a field of the record (not split per segment) and empty
    accession_field = config.raw_reads_accession_field
    if accession_field in record and not record[accession_field]:
        record[accession_field] = run.accession

    raw_reads_hash_input = json.dumps(
        {
            "run": run.accession,
            "instrument": run.instrument_model,
            "files": [{"name": f.name, "url": f.url, "md5": f.md5} for f in run.files],
        },
        sort_keys=True,
    )
    record["hash"] = hashlib.md5(
        (record["hash"] + raw_reads_hash_input).encode(), usedforsecurity=False
    ).hexdigest()


def load_excluded_run_accessions(depositions_path: str | None) -> set[str]:
    if not depositions_path:
        return set()
    with open(depositions_path, encoding="utf-8") as file:
        return set(json.load(file).get("runAccessions", []))


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input-metadata", required=True, type=click.Path(exists=True))
@click.option("--ena-read-runs", required=True, type=click.Path(exists=True))
@click.option(
    "--loculus-depositions",
    required=False,
    type=click.Path(exists=True),
    help="Output of get_loculus_depositions.py; runs Loculus deposited itself are not attached",
)
@click.option("--output-metadata", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(  # noqa: PLR0913, PLR0917
    config_file: str,
    input_metadata: str,
    ena_read_runs: str,
    loculus_depositions: str | None,
    output_metadata: str,
    log_level: str,
) -> None:
    logger.setLevel(log_level)
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)

    runs = load_runs(ena_read_runs, load_excluded_run_accessions(loculus_depositions))
    runs_by_sample: defaultdict[str, list[Run]] = defaultdict(list)
    for run in runs.values():
        runs_by_sample[run.sample_accession].append(run)

    matched_by_counts: defaultdict[str, int] = defaultdict(int)
    Path(output_metadata).unlink(missing_ok=True)
    for entry in orjsonl.stream(input_metadata):
        run, matched_by = select_run(entry["metadata"], runs, runs_by_sample, config)
        attach_run(entry["metadata"], run, config)
        matched_by_counts[matched_by] += 1
        orjsonl.append(output_metadata, entry)

    logger.info(f"Attached raw reads, entries by how runs were matched: {dict(matched_by_counts)}")


if __name__ == "__main__":
    main()
