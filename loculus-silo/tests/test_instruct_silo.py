# ruff:file-ignore[assert]
from __future__ import annotations

import json
from pathlib import Path

import pytest
from helpers import compress_ndjson
from silo_import.instruct_silo import PreprocessingInputs, SiloRunner

DATABASE_CONFIG = """\
schema:
  instanceName: test
  opennessLevel: OPEN
  metadata:
    - name: accession
      type: string
    - name: pipelineVersion
      type: string
  primaryKey: accession
"""

RECORDS = [
    {
        "accession": accession,
        "pipelineVersion": "1",
        "unaligned_main": sequence,
        "main": {"sequence": sequence, "insertions": []},
        "gene1": {"sequence": "MYKW", "insertions": []},
    }
    for accession, sequence in [("seq1", "ATCG"), ("seq2", "GCTA"), ("seq3", "TTAA")]
]

REFERENCE_GENOMES = {
    "nucleotideSequences": [{"name": "main", "sequence": "ATCG"}],
    "genes": [{"name": "gene1", "sequence": "MYKW"}],
}


def make_inputs(tmp_path: Path) -> PreprocessingInputs:
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    inputs = PreprocessingInputs(
        database_config=input_dir / "database_config.yaml",
        reference_genomes=input_dir / "reference_genomes.json",
        input_file=input_dir / "data.ndjson.zst",
        lineage_definitions=[],
        output_dir=tmp_path / "output",
    )
    inputs.database_config.write_text(DATABASE_CONFIG, encoding="utf-8")
    inputs.reference_genomes.write_text(json.dumps(REFERENCE_GENOMES), encoding="utf-8")
    inputs.input_file.write_bytes(compress_ndjson(RECORDS))
    return inputs


def test_silo_runner_saves_database(tmp_path: Path) -> None:
    rhydb = pytest.importorskip("rhydb")
    inputs = make_inputs(tmp_path)

    SiloRunner(inputs).run_preprocessing(timeout_seconds=60)

    saved_states = [p for p in inputs.output_dir.iterdir() if p.is_dir()]
    assert len(saved_states) == 1
    assert (saved_states[0] / "data_version.silo").exists()
    with rhydb.Database(str(inputs.output_dir)) as database:
        accessions = database.query("data.project({accession})").to_pydict()["accession"]
    assert sorted(accessions) == ["seq1", "seq2", "seq3"]


def test_silo_runner_failure(tmp_path: Path) -> None:
    inputs = make_inputs(tmp_path)
    inputs.input_file.unlink()

    with pytest.raises(RuntimeError, match="failed with exit code"):
        SiloRunner(inputs).run_preprocessing(timeout_seconds=60)

    assert not inputs.output_dir.exists()


def test_silo_runner_timeout(tmp_path: Path) -> None:
    inputs = make_inputs(tmp_path)

    with pytest.raises(TimeoutError, match="timed out"):
        SiloRunner(inputs).run_preprocessing(timeout_seconds=0)
