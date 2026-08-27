from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "loculus_client.py"
SPEC = importlib.util.spec_from_file_location("loculus_client", SCRIPT_PATH)
loculus_client = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(loculus_client)

HEADER = "id\tcountry\n"


def make_config(batch_chunk_size: int):
    return loculus_client.Config(
        organism="dummy",
        backend_url="http://backend",
        keycloak_token_url="http://keycloak",  # noqa: S106
        keycloak_client_id="dummy",
        username="dummy",
        password="dummy",  # noqa: S106
        group_name="dummy",
        nucleotide_sequences=["main"],
        segmented=False,
        batch_chunk_size=batch_chunk_size,
    )


def write_input(tmp_path: Path, n_records: int) -> tuple[str, str]:
    ids = [f"id{i:03d}" for i in range(n_records)]
    metadata_file = tmp_path / "metadata.tsv"
    metadata_file.write_text(
        HEADER + "".join(f"{id_}\tSwitzerland\n" for id_ in ids), encoding="utf-8"
    )
    fasta_file = tmp_path / "sequences.fasta"
    fasta_file.write_text("".join(f">{id_}\nACGT\n" for id_ in ids), encoding="utf-8")
    return str(fasta_file), str(metadata_file)


def submitted_batches(tmp_path: Path, monkeypatch, n_records: int, batch_chunk_size: int):
    """Run post_fasta_batches without HTTP, returning the metadata TSV of each batch."""
    batches = []

    def fake_submit(url, config, params, batch_it):
        batches.append(list(batch_it.metadata_batch_output))
        return "response"

    monkeypatch.setattr(loculus_client, "submit", fake_submit)
    fasta_file, metadata_file = write_input(tmp_path, n_records)
    loculus_client.post_fasta_batches(
        "http://backend/submit",
        fasta_file,
        metadata_file,
        make_config(batch_chunk_size),
        {},
    )
    return batches


@pytest.mark.parametrize("batch_chunk_size", [1, 2, 3, 5, 100])
def test_every_batch_starts_with_the_metadata_header(tmp_path, monkeypatch, batch_chunk_size):
    batches = submitted_batches(tmp_path, monkeypatch, 7, batch_chunk_size)

    assert batches
    for batch in batches:
        assert batch[0] == HEADER


@pytest.mark.parametrize("batch_chunk_size", [1, 2, 3, 5, 100])
def test_every_record_is_submitted_exactly_once(tmp_path, monkeypatch, batch_chunk_size):
    batches = submitted_batches(tmp_path, monkeypatch, 7, batch_chunk_size)

    submitted = [line for batch in batches for line in batch[1:]]
    assert submitted == [f"id{i:03d}\tSwitzerland\n" for i in range(7)]
    assert all(HEADER not in batch[1:] for batch in batches)
