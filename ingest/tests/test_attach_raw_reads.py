from __future__ import annotations

import csv
import importlib.util
import json
from pathlib import Path

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "attach_raw_reads.py"
SPEC = importlib.util.spec_from_file_location("attach_raw_reads", SCRIPT_PATH)
attach_raw_reads = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(attach_raw_reads)

CONFIG = attach_raw_reads.Config(
    raw_reads_file_category="rawReads",
    raw_reads_accession_field="insdcRawReadsAccession",
    biosample_field="biosampleAccession",
    sequencing_instrument_field="sequencingInstrument",
)
FASTQ_DIR = "ftp.sra.ebi.ac.uk/vol1/fastq/ERR100/093"
RUN_FIELDS = [
    "run_accession",
    "sample_accession",
    "instrument_model",
    "base_count",
    "fastq_ftp",
    "fastq_bytes",
    "fastq_md5",
]


def run_row(
    accession: str,
    sample: str = "SAMEA1",
    instrument: str = "Illumina MiSeq",
    base_count: int = 100,
    file_names: tuple[str, ...] | None = None,
) -> dict[str, str]:
    file_names = (
        file_names
        if file_names is not None
        else (f"{accession}_1.fastq.gz", f"{accession}_2.fastq.gz")
    )
    return {
        "run_accession": accession,
        "sample_accession": sample,
        "instrument_model": instrument,
        "base_count": str(base_count),
        "fastq_ftp": ";".join(f"{FASTQ_DIR}/{accession}/{name}" for name in file_names),
        "fastq_bytes": ";".join(str(10 + i) for i in range(len(file_names))),
        "fastq_md5": ";".join(f"md5-{name}" for name in file_names),
    }


def write_runs(path: Path, rows: list[dict[str, str]]) -> str:
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, RUN_FIELDS, delimiter="\t")
        writer.writeheader()
        writer.writerows(rows)
    return str(path)


def make_run(accession: str, sample: str = "SAMEA1", base_count: int = 100):
    row = run_row(accession, sample=sample, base_count=base_count)
    return attach_raw_reads.Run(
        accession=accession,
        sample_accession=sample,
        instrument_model=row["instrument_model"],
        base_count=base_count,
        files=attach_raw_reads.parse_read_files(row),
    )


def test_paired_run_drops_unpaired_reads_file() -> None:
    row = run_row("ERR1", file_names=("ERR1.fastq.gz", "ERR1_1.fastq.gz", "ERR1_2.fastq.gz"))

    files = attach_raw_reads.parse_read_files(row)

    assert [f.name for f in files] == ["ERR1_1.fastq.gz", "ERR1_2.fastq.gz"]
    assert files[0].url == f"https://{FASTQ_DIR}/ERR1/ERR1_1.fastq.gz"
    assert files[0].size == 11
    assert files[0].md5 == "md5-ERR1_1.fastq.gz"


def test_single_end_run_keeps_its_file() -> None:
    files = attach_raw_reads.parse_read_files(run_row("ERR1", file_names=("ERR1.fastq.gz",)))

    assert [f.name for f in files] == ["ERR1.fastq.gz"]


def test_runs_without_single_or_paired_fastq_files_are_not_attachable() -> None:
    assert attach_raw_reads.parse_read_files(run_row("ERR1", file_names=())) == ()
    assert (
        attach_raw_reads.parse_read_files(
            run_row("ERR1", file_names=("ERR1.fastq.gz", "other.fastq.gz"))
        )
        == ()
    )


def test_load_runs_skips_unspecified_instrument_deposited_and_fileless_runs(
    tmp_path: Path,
) -> None:
    runs_path = write_runs(
        tmp_path / "runs.tsv",
        [
            run_row("ERR1"),
            run_row("ERR2", instrument="unspecified"),
            run_row("ERR3"),
            run_row("ERR4", file_names=()),
        ],
    )

    runs = attach_raw_reads.load_runs(runs_path, excluded_run_accessions={"ERR3"})

    assert set(runs) == {"ERR1"}


def test_listed_run_accession_takes_precedence_over_biosample() -> None:
    runs = {"ERR1": make_run("ERR1", base_count=1), "ERR2": make_run("ERR2", base_count=1000)}
    by_sample = {"SAMEA1": list(runs.values())}
    record = {"insdcRawReadsAccession": "ERR1", "biosampleAccession": "SAMEA1"}

    run, matched_by = attach_raw_reads.select_run(record, runs, by_sample, CONFIG)

    assert run.accession == "ERR1"
    assert matched_by == "run accession"


def test_listed_run_accessions_are_read_from_per_segment_fields() -> None:
    runs = {"ERR1": make_run("ERR1")}
    record = {"insdcRawReadsAccession_L": "", "insdcRawReadsAccession_S": "SRR9, ERR1"}

    run, _ = attach_raw_reads.select_run(record, runs, {}, CONFIG)

    assert run.accession == "ERR1"


def test_listed_run_accession_without_attachable_run_does_not_fall_back_to_biosample() -> None:
    runs = {"ERR2": make_run("ERR2")}
    record = {"insdcRawReadsAccession": "SRR9", "biosampleAccession": "SAMEA1"}

    run, matched_by = attach_raw_reads.select_run(record, runs, {"SAMEA1": [runs["ERR2"]]}, CONFIG)

    assert run is None
    assert matched_by == "none"


def test_biosample_match_selects_run_with_most_bases() -> None:
    runs = [make_run("ERR1", base_count=10), make_run("ERR2", base_count=20)]
    record = {"insdcRawReadsAccession": "", "biosampleAccession": "SAMEA1"}

    run, matched_by = attach_raw_reads.select_run(record, {}, {"SAMEA1": runs}, CONFIG)

    assert run.accession == "ERR2"
    assert matched_by == "biosample"


def test_entry_without_run_keeps_its_hash() -> None:
    record = {"hash": "abc", "insdcRawReadsAccession": ""}

    attach_raw_reads.attach_run(record, None, CONFIG)

    assert record == {
        "hash": "abc",
        "insdcRawReadsAccession": "",
        "files.rawReads": "",
        "sequencingInstrument": "",
    }


def test_attaching_run_adds_files_and_metadata_and_changes_hash() -> None:
    record = {"hash": "abc", "insdcRawReadsAccession": "", "sequencingInstrument": ""}

    attach_raw_reads.attach_run(record, make_run("ERR1"), CONFIG)

    assert json.loads(record["files.rawReads"]) == [
        {"name": "ERR1_1.fastq.gz", "url": f"https://{FASTQ_DIR}/ERR1/ERR1_1.fastq.gz", "size": 10},
        {"name": "ERR1_2.fastq.gz", "url": f"https://{FASTQ_DIR}/ERR1/ERR1_2.fastq.gz", "size": 11},
    ]
    assert record["sequencingInstrument"] == "Illumina MiSeq"
    assert record["insdcRawReadsAccession"] == "ERR1"
    assert record["hash"] != "abc"

    same_record = {"hash": "abc", "insdcRawReadsAccession": "", "sequencingInstrument": ""}
    attach_raw_reads.attach_run(same_record, make_run("ERR1"), CONFIG)
    assert same_record["hash"] == record["hash"]


def test_attaching_run_keeps_existing_metadata() -> None:
    record = {"hash": "abc", "insdcRawReadsAccession": "SRR9", "sequencingInstrument": "MinION"}

    attach_raw_reads.attach_run(record, make_run("ERR1"), CONFIG)

    assert record["insdcRawReadsAccession"] == "SRR9"
    assert record["sequencingInstrument"] == "MinION"
