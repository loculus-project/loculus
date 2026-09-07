from __future__ import annotations

import dataclasses
import importlib.util
import json
from pathlib import Path

import pandas as pd
import pytest
import test_ingest
import yaml
from Bio import SeqIO

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "loculus_client.py"
SPEC = importlib.util.spec_from_file_location("loculus_client", SCRIPT_PATH)
loculus_client = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(loculus_client)

EXPECTED_OUTPUT_DIR = Path("tests/expected_output_cchf")
RESULTS_DIR = Path("results")
REVOKE_METADATA = RESULTS_DIR / "metadata_to_submit_prior_to_revoke.tsv"
REVOKE_SEQUENCES = RESULTS_DIR / "sequences_to_submit_prior_to_revoke.fasta"
REVOKE_MAP = RESULTS_DIR / "to_revoke.json"


class FakeResponse:
    """Minimal stand-in for requests.Response for the code paths exercised here."""

    def __init__(self, payload, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload)

    def json(self):
        return self._payload


@pytest.fixture(scope="module")
def cchf_pipeline():
    """Run the ingest pipeline on the CCHF test data far enough to produce the
    metadata / sequences / to_revoke.json that feed ``regroup_and_revoke``.

    The CCHF fixture yields a single regrouped record whose new joint accession
    (``KX013462.1.L/KX013463.1.M/KX013464.1.S``) replaces two old Loculus groups
    (``LOC_0000VF8`` and ``LOC_0000VF9``); see tests/expected_output_cchf/to_revoke.json.
    """
    test_ingest.prepare_compare_hashes_inputs()
    test_ingest.run_snakemake("compare_hashes")
    test_ingest.run_snakemake("prepare_files")


def load_config(**overrides):
    """Build a Config from the pipeline-generated results/config.yaml, exactly as
    call_loculus.py does, optionally overriding individual fields."""
    full_config = yaml.safe_load((RESULTS_DIR / "config.yaml").read_text(encoding="utf-8"))
    fields = {
        f.name: full_config.get(f.name, []) for f in dataclasses.fields(loculus_client.Config)
    }
    fields.update(overrides)
    return loculus_client.Config(**fields)


def replicate_cchf_revoke_record(tmp_path: Path, group_ids: list[str]) -> tuple[str, str]:
    """Write metadata.tsv + sequences.fasta holding the single CCHF revoke record
    duplicated once per id in group_ids."""
    df = pd.read_csv(REVOKE_METADATA, sep="\t")
    segments = {
        record.id.rsplit("_", 1)[1]: str(record.seq)
        for record in SeqIO.parse(REVOKE_SEQUENCES, "fasta")
    }

    new_metadata = pd.concat(
        [df.iloc[[0]]] * len(group_ids),
        ignore_index=True,
    )
    new_metadata["id"] = group_ids

    fasta_lines: list[str] = []
    for group_id in group_ids:
        for segment, seq in segments.items():
            fasta_lines.extend((f">{group_id}_{segment}", seq))

    metadata_path = tmp_path / "metadata.tsv"
    new_metadata.to_csv(metadata_path, sep="\t", index=False)
    sequences_path = tmp_path / "sequences.fasta"
    sequences_path.write_text("\n".join(fasta_lines) + "\n", encoding="utf-8")
    return str(metadata_path), str(sequences_path)


def install_fake_backend(monkeypatch, known_submission_ids: set[str] | None = None):
    """Patch make_request so /submit echoes back a new accession per submissionId
    and /revoke calls are recorded instead of sent.

    known_submission_ids, when given, restricts which submissionIds the fake /submit
    response includes - used to simulate a submit response that is missing entries.
    """
    revoke_calls: list[dict] = []

    def fake_make_request(_method, url, _config, **kwargs):
        if url.endswith("/submit"):
            df = pd.read_csv(kwargs["files"]["metadataFile"][1], sep="\t")
            return FakeResponse(
                [
                    {"submissionId": sid, "accession": f"LOC_NEW_{sid}"}
                    for sid in df["id"].tolist()
                    if known_submission_ids is None or sid in known_submission_ids
                ]
            )
        if url.endswith("/revoke"):
            body = kwargs["json_body"]
            revoke_calls.append(body)
            return FakeResponse(
                [{"accession": accession, "version": 2} for accession in body["accessions"]]
            )
        msg = f"unexpected url: {url}"
        raise AssertionError(msg)

    monkeypatch.setattr(loculus_client, "make_request", fake_make_request)
    return revoke_calls


def test_regroup_and_revoke_on_cchf_fixture(cchf_pipeline, monkeypatch):
    """Feed the real CCHF pipeline output straight into regroup_and_revoke: the one
    regrouped record must revoke both old Loculus groups, each pointing at the new
    accession."""
    assert test_ingest.compare_json_files(REVOKE_MAP, EXPECTED_OUTPUT_DIR / "to_revoke.json")

    to_revoke = json.loads(REVOKE_MAP.read_text(encoding="utf-8"))
    (submission_id,) = to_revoke
    old_accessions = set(to_revoke[submission_id])

    revoke_calls = install_fake_backend(monkeypatch)
    responses = loculus_client.regroup_and_revoke(
        str(REVOKE_METADATA), str(REVOKE_SEQUENCES), str(REVOKE_MAP), load_config(), group_id="1"
    )

    revoked = {call["accessions"][0]: call["versionComment"] for call in revoke_calls}
    assert set(revoked) == old_accessions
    assert all(f"LOC_NEW_{submission_id}" in comment for comment in revoked.values())
    assert len(responses) == len(old_accessions)


def test_regroup_and_revoke_spans_multiple_submit_batches(cchf_pipeline, tmp_path, monkeypatch):
    """Replicate the CCHF revoke record into three and force more than one submit
    batch: every submissionId in the revoke map must still resolve to its new
    accession (regression test for the bug where only the last batch's submit
    response was kept)."""
    group_ids = ["grpA", "grpB", "grpC"]
    metadata, sequences = replicate_cchf_revoke_record(tmp_path, group_ids)
    to_revoke = {gid: {f"LOC_OLD_{i}": f"INSDC_{i}"} for i, gid in enumerate(group_ids)}
    revoke_map = tmp_path / "to_revoke.json"
    revoke_map.write_text(json.dumps(to_revoke), encoding="utf-8")

    revoke_calls = install_fake_backend(monkeypatch)
    # 3 records, batch_chunk_size=2 -> submit batches are [grpA, grpB] and [grpC]
    config = load_config(batch_chunk_size=2)
    responses = loculus_client.regroup_and_revoke(
        metadata, sequences, str(revoke_map), config, group_id="1"
    )

    revoked = {call["accessions"][0] for call in revoke_calls}
    assert revoked == {"LOC_OLD_0", "LOC_OLD_1", "LOC_OLD_2"}
    assert len(responses) == len(group_ids)


def test_regroup_and_revoke_aborts_when_new_accession_missing(cchf_pipeline, tmp_path, monkeypatch):
    """If the submit response does not contain a new accession for every submissionId
    in the revoke map, nothing should be revoked."""
    group_ids = ["grpA", "grpB"]
    metadata, sequences = replicate_cchf_revoke_record(tmp_path, group_ids)
    to_revoke = {gid: {f"LOC_OLD_{gid}": "INSDC"} for gid in group_ids}
    revoke_map = tmp_path / "to_revoke.json"
    revoke_map.write_text(json.dumps(to_revoke), encoding="utf-8")

    # submit response is missing grpB
    revoke_calls = install_fake_backend(monkeypatch, known_submission_ids={"grpA"})
    config = load_config(batch_chunk_size=2)
    with pytest.raises(ValueError, match="missing new accessions"):
        loculus_client.regroup_and_revoke(
            metadata, sequences, str(revoke_map), config, group_id="1"
        )

    assert revoke_calls == []
