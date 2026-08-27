from __future__ import annotations

import importlib.util
from pathlib import Path

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "loculus_client.py"
SPEC = importlib.util.spec_from_file_location("loculus_client", SCRIPT_PATH)
loculus_client = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(loculus_client)

HEADER = "id\tcountry\n"


def test_every_batch_starts_with_the_metadata_header(tmp_path, monkeypatch):
    """A chunk size of 1 used to send every batch but the first without a header."""
    ids = [f"id{i}" for i in range(4)]
    metadata_file = tmp_path / "metadata.tsv"
    metadata_file.write_text(HEADER + "".join(f"{i}\tSwitzerland\n" for i in ids), encoding="utf-8")
    fasta_file = tmp_path / "sequences.fasta"
    fasta_file.write_text("".join(f">{i}\nACGT\n" for i in ids), encoding="utf-8")

    batches = []
    monkeypatch.setattr(
        loculus_client,
        "submit",
        lambda url, config, params, batch_it: batches.append(list(batch_it.metadata_batch_output)),
    )
    config = loculus_client.Config(
        organism="dummy",
        backend_url="http://backend",
        keycloak_token_url="http://keycloak",  # noqa: S106
        keycloak_client_id="dummy",
        username="dummy",
        password="dummy",  # noqa: S106
        group_name="dummy",
        nucleotide_sequences=["main"],
        segmented=False,
        batch_chunk_size=1,
    )

    loculus_client.post_fasta_batches(
        "http://backend/submit", str(fasta_file), str(metadata_file), config, {}
    )

    assert batches
    assert all(batch[0] == HEADER for batch in batches)
