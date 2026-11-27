from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import orjsonl
import pytest

SCRIPTS_DIR = Path(__file__).parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))  # override_group_segments imports prepare_metadata
SPEC = importlib.util.spec_from_file_location(
    "override_group_segments", SCRIPTS_DIR / "override_group_segments.py"
)
override_group_segments = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(override_group_segments)

CONFIG = override_group_segments.Config(
    compound_country_field="geoLocation",
    fasta_id_field="genbankAccession",
    insdc_segment_specific_fields=["insdcAccessionFull"],
    nucleotide_sequences=["L", "M", "S"],
    segmented=True,
    organism="test-organism",
)


def make_record(accession: str, segment: str, **extra: str) -> dict:
    return {
        "id": accession,
        "metadata": {
            "insdcAccessionFull": accession,
            "segment": segment,
            "hash": f"hash-{accession}",
            **extra,
        },
    }


@pytest.fixture
def in_tmp_dir(tmp_path, monkeypatch):
    # group_records writes errors to the relative path results/errors.ndjson
    monkeypatch.chdir(tmp_path)
    (tmp_path / "results").mkdir()
    return tmp_path


def run_group_records(records: list[dict], tmp_path: Path) -> tuple[list[dict], dict[str, str]]:
    output = tmp_path / "grouped.ndjson"
    fasta_id_map: dict[str, str] = {}
    override_group_segments.group_records(records, str(output), fasta_id_map, CONFIG, {})
    grouped = list(orjsonl.stream(output)) if output.exists() else []
    return grouped, fasta_id_map


def test_groups_segments_in_config_order(in_tmp_dir):
    records = [make_record("C.1", "S"), make_record("A.1", "L"), make_record("B.1", "M")]

    grouped, fasta_id_map = run_group_records(records, in_tmp_dir)

    assert len(grouped) == 1
    assert grouped[0]["id"] == "A.1.L/B.1.M/C.1.S"
    assert fasta_id_map == {
        "A.1": "A.1.L/B.1.M/C.1.S_L",
        "B.1": "A.1.L/B.1.M/C.1.S_M",
        "C.1": "A.1.L/B.1.M/C.1.S_S",
    }


def test_hash_and_metadata_independent_of_input_order(in_tmp_dir):
    """When segments disagree on a shared field, the chosen value and hash must
    not depend on the order the records appear in the input."""
    records = [
        make_record("A.1", "L", country="Germany"),
        make_record("B.1", "M", country="France"),
    ]

    forward, _ = run_group_records(records, in_tmp_dir)
    (in_tmp_dir / "grouped.ndjson").unlink()
    backward, _ = run_group_records(list(reversed(records)), in_tmp_dir)

    assert forward[0]["metadata"]["country"] == "Germany"  # value from first segment (L)
    assert forward[0]["metadata"] == backward[0]["metadata"]


def test_rejects_duplicate_segments(in_tmp_dir):
    records = [make_record("A.1", "L"), make_record("B.1", "L")]

    grouped, fasta_id_map = run_group_records(records, in_tmp_dir)

    assert grouped == []
    assert fasta_id_map == {}
    assert list(orjsonl.stream(in_tmp_dir / "results" / "errors.ndjson")) == [records]


def test_rejects_unknown_segment_instead_of_crashing(in_tmp_dir):
    records = [make_record("A.1", "L"), make_record("B.1", "X")]

    grouped, fasta_id_map = run_group_records(records, in_tmp_dir)

    assert grouped == []
    assert fasta_id_map == {}
    assert list(orjsonl.stream(in_tmp_dir / "results" / "errors.ndjson")) == [records]
