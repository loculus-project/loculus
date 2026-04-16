"""Tests for lineage definition subsetting and field-mapping discovery."""

# ruff: noqa: S101
from __future__ import annotations

from pathlib import Path
from textwrap import dedent
from unittest.mock import patch

import pytest
import yaml
from helpers import compress_ndjson
from silo_import import lineage
from silo_import.config import ImporterConfig
from silo_import.lineage import (
    read_lineage_field_mapping,
    subset_lineage_yaml,
    update_lineage_definitions,
)
from silo_import.paths import ImporterPaths


SAMPLE_LINEAGE_YAML = dedent(
    """\
    A:
      aliases: []
      parents: []
    A.1:
      aliases: []
      parents:
        - A
    A.1.1:
      aliases:
        - B
      parents:
        - A.1
    A.2:
      aliases: []
      parents:
        - A
    """
)


def _make_paths(tmp_path: Path) -> ImporterPaths:
    silo_binary = tmp_path / "silo"
    preprocessing_config = tmp_path / "config.yaml"
    paths = ImporterPaths.from_root(tmp_path, silo_binary, preprocessing_config)
    paths.ensure_directories()
    return paths


def _make_config(
    tmp_path: Path,
    lineage_definitions: dict[str, dict[int, str]] | None,
) -> ImporterConfig:
    return ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions=lineage_definitions,
        hard_refresh_interval=1,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
        silo_binary=tmp_path / "silo",
        preprocessing_config=tmp_path / "config.yaml",
    )


def test_subset_keeps_only_observed_lineage_and_its_ancestors() -> None:
    text, kept, total = subset_lineage_yaml(SAMPLE_LINEAGE_YAML, ["A.1.1"])

    parsed = yaml.safe_load(text)
    assert set(parsed.keys()) == {"A", "A.1", "A.1.1"}
    # Sibling branches are dropped.
    assert "A.2" not in parsed
    assert kept == 3
    assert total == 4


def test_subset_resolves_aliases_to_canonical_names() -> None:
    # "B" is an alias for canonical "A.1.1".
    text, kept, _ = subset_lineage_yaml(SAMPLE_LINEAGE_YAML, ["B"])

    parsed = yaml.safe_load(text)
    assert set(parsed.keys()) == {"A", "A.1", "A.1.1"}
    assert parsed["A.1.1"]["aliases"] == ["B"]
    assert kept == 3


def test_subset_handles_unknown_values_gracefully() -> None:
    # Unknown values are dropped silently; A.2 is real and brings in A.
    text, kept, _ = subset_lineage_yaml(SAMPLE_LINEAGE_YAML, ["A.2", "totally-bogus", ""])

    parsed = yaml.safe_load(text)
    assert set(parsed.keys()) == {"A", "A.2"}
    assert kept == 2


def test_subset_with_no_used_values_yields_empty_yaml() -> None:
    text, kept, total = subset_lineage_yaml(SAMPLE_LINEAGE_YAML, [])

    assert yaml.safe_load(text) is None or yaml.safe_load(text) == {}
    assert kept == 0
    assert total == 4


def test_subset_returns_input_unchanged_when_yaml_is_not_a_mapping() -> None:
    # Garbage in -> garbage out, but no exception.
    junk = "lineage: data\n"
    text, kept, total = subset_lineage_yaml(junk, ["A"])

    # ``lineage: data`` *is* a mapping, so it parses to {"lineage": "data"} and
    # is reduced to {} because "A" isn't in it. Use a non-mapping instead.
    text, kept, total = subset_lineage_yaml("- only\n- a\n- list\n", ["A"])
    assert text == "- only\n- a\n- list\n"
    assert kept == 0
    assert total == 0


def test_read_lineage_field_mapping_extracts_generate_lineage_index(tmp_path: Path) -> None:
    db_config = tmp_path / "database_config.yaml"
    db_config.write_text(
        dedent(
            """\
            schema:
              instanceName: SARS-CoV-2
              metadata:
                - name: accession
                  type: string
                - name: pangoLineage
                  type: string
                  generateIndex: true
                  generateLineageIndex: pangoLineage
                - name: alternativeLineage
                  type: string
                  generateIndex: true
                  generateLineageIndex: alternativeLineage
                - name: cladeS_S
                  type: string
                  generateIndex: true
                  generateLineageIndex: cchfS
                - name: cladeS_L
                  type: string
                  generateIndex: true
                  generateLineageIndex: cchfS
              primaryKey: accession
            """
        ),
        encoding="utf-8",
    )

    mapping = read_lineage_field_mapping(db_config)

    assert mapping == {
        "pangoLineage": ["pangoLineage"],
        "alternativeLineage": ["alternativeLineage"],
        "cchfS": ["cladeS_S", "cladeS_L"],
    }


def test_read_lineage_field_mapping_returns_empty_when_file_missing(tmp_path: Path) -> None:
    assert read_lineage_field_mapping(tmp_path / "missing.yaml") == {}


def test_update_lineage_definitions_writes_subsetted_yaml(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    paths = _make_paths(tmp_path)
    config = _make_config(
        tmp_path, lineage_definitions={"pangoLineage": {1: "http://lineage"}}
    )

    monkeypatch.setattr(lineage, "_download_lineage_text", lambda url: SAMPLE_LINEAGE_YAML)  # noqa: ARG005

    update_lineage_definitions(
        pipeline_version=1,
        config=config,
        paths=paths,
        lineage_values_per_system={"pangoLineage": {"A.1.1"}},
    )

    written = (paths.input_dir / "pangoLineage.yaml").read_text(encoding="utf-8")
    parsed = yaml.safe_load(written)
    assert set(parsed.keys()) == {"A", "A.1", "A.1.1"}


def test_update_lineage_definitions_falls_back_to_full_when_no_field_mapping(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    paths = _make_paths(tmp_path)
    config = _make_config(
        tmp_path, lineage_definitions={"pangoLineage": {1: "http://lineage"}}
    )

    monkeypatch.setattr(lineage, "_download_lineage_text", lambda url: SAMPLE_LINEAGE_YAML)  # noqa: ARG005

    # No values_per_system entry for ``pangoLineage`` -> write full file
    # unchanged. This preserves behaviour for setups whose database config
    # cannot be parsed.
    update_lineage_definitions(
        pipeline_version=1,
        config=config,
        paths=paths,
        lineage_values_per_system={},
    )

    written = (paths.input_dir / "pangoLineage.yaml").read_text(encoding="utf-8")
    assert written == SAMPLE_LINEAGE_YAML


def test_update_lineage_definitions_writes_empty_when_pipeline_version_missing(
    tmp_path: Path,
) -> None:
    paths = _make_paths(tmp_path)
    config = _make_config(
        tmp_path, lineage_definitions={"pangoLineage": {1: "http://lineage"}}
    )

    update_lineage_definitions(
        pipeline_version=None,
        config=config,
        paths=paths,
        lineage_values_per_system=None,
    )

    written = (paths.input_dir / "pangoLineage.yaml").read_text(encoding="utf-8")
    assert written == "{}\n"


def test_runner_subsets_lineage_yaml_to_observed_values(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """End-to-end: data + database config -> subsetted lineage file."""
    from helpers import MockHttpResponse, make_mock_download_func
    from silo_import.download_manager import DownloadManager
    from silo_import.runner import ImporterRunner

    paths = _make_paths(tmp_path)
    config = _make_config(
        tmp_path, lineage_definitions={"pangoLineage": {1: "http://lineage"}}
    )

    # Database config tells the importer that ``pangoLineageField`` is the
    # metadata field that holds values from system ``pangoLineage``.
    paths.database_config_path.write_text(
        dedent(
            """\
            schema:
              metadata:
                - name: pangoLineageField
                  type: string
                  generateIndex: true
                  generateLineageIndex: pangoLineage
            """
        ),
        encoding="utf-8",
    )

    records = [
        {
            "metadata": {
                "pipelineVersion": "1",
                "accession": "seq1",
                "pangoLineageField": "A.1.1",
            },
            "unalignedNucleotideSequences": {"main": "ATCG"},
            "alignedNucleotideSequences": {"main": "ATCG"},
            "alignedAminoAcidSequences": {"gene1": "MYKW"},
            "nucleotideInsertions": {"main": []},
            "aminoAcidInsertions": {"gene1": []},
        },
        {
            "metadata": {
                "pipelineVersion": "1",
                "accession": "seq2",
                "pangoLineageField": "A.2",
            },
            "unalignedNucleotideSequences": {"main": "GCTA"},
            "alignedNucleotideSequences": {"main": "GCTA"},
            "alignedAminoAcidSequences": {"gene1": "MYKW"},
            "nucleotideInsertions": {"main": []},
            "aminoAcidInsertions": {"gene1": []},
        },
    ]
    body = compress_ndjson(records)

    responses = [
        MockHttpResponse(
            status=200,
            headers={"ETag": 'W/"abc"', "x-total-records": str(len(records))},
            body=body,
        )
    ]
    mock_download, _ = make_mock_download_func(responses)

    monkeypatch.setattr(lineage, "_download_lineage_text", lambda url: SAMPLE_LINEAGE_YAML)  # noqa: ARG005

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()

    written = (paths.input_dir / "pangoLineage.yaml").read_text(encoding="utf-8")
    parsed = yaml.safe_load(written)
    # A.1.1 -> needs A.1 and A. A.2 -> needs A. So the subset is {A, A.1,
    # A.1.1, A.2}, and unrelated branches (none here) are dropped.
    assert set(parsed.keys()) == {"A", "A.1", "A.1.1", "A.2"}
