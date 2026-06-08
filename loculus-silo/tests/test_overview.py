# ruff: noqa: S101
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from helpers import MockHttpResponse, compress_ndjson, make_mock_download_func, read_ndjson_file
from silo_import.overview import OverviewImporterConfig, OverviewImporterRunner
from silo_import.paths import ImporterPaths


def make_config(tmp_path: Path) -> OverviewImporterConfig:
    return OverviewImporterConfig(
        backend_base_urls={"virus-a": "http://backend/virus-a", "virus-b": "http://backend/virus-b"},
        organism_display_names={"virus-a": "Virus A", "virus-b": "Virus B"},
        clade_field_candidates={
            "virus-a": ["pangoLineage", "nextcladeClade"],
            "virus-b": ["genotype"],
        },
        metadata_fields=[
            "accessionVersion",
            "accession",
            "version",
            "organismKey",
            "organism",
            "clade",
            "sampleCollectionDate",
        ],
        hard_refresh_interval=1000,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
        silo_binary=tmp_path / "silo",
        preprocessing_config=tmp_path / "config.yaml",
    )


def make_paths(tmp_path: Path) -> ImporterPaths:
    return ImporterPaths.from_root(tmp_path, tmp_path / "silo", tmp_path / "config.yaml")


def test_overview_runner_merges_organisms_and_derives_clade(tmp_path: Path) -> None:
    config = make_config(tmp_path)
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    responses = [
        MockHttpResponse(
            status=200,
            headers={"ETag": '"a"'},
            body=compress_ndjson(
                [
                    {
                        "metadata": {
                            "accessionVersion": "REV_1.1",
                            "accession": "REV_1",
                            "version": 1,
                            "sampleCollectionDate": "2024-01-01",
                            "pangoLineage": "BA.2",
                        }
                    }
                ]
            ),
        ),
        MockHttpResponse(
            status=200,
            headers={"ETag": '"b"'},
            body=compress_ndjson(
                [
                    {
                        "metadata": {
                            "accessionVersion": "REV_2.1",
                            "accession": "REV_2",
                            "version": 1,
                            "sampleCollectionDate": "2024-02-01",
                            "genotype": "A2",
                            "unconfiguredField": "ignored",
                        }
                    }
                ]
            ),
        ),
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    runner = OverviewImporterRunner(config, paths, download_func=mock_download)
    with patch.object(runner.silo, "run_preprocessing"), patch(
        "silo_import.overview.transform_data_format",
        lambda data_path, transformed_path: transformed_path.write_bytes(data_path.read_bytes()),
    ):
        runner.run_once()

    assert read_ndjson_file(paths.silo_input_data_path) == [
        {
            "metadata": {
                "accessionVersion": "REV_1.1",
                "accession": "REV_1",
                "version": 1,
                "sampleCollectionDate": "2024-01-01",
                "organismKey": "virus-a",
                "organism": "Virus A",
                "clade": "BA.2",
            },
            "unalignedNucleotideSequences": {},
            "alignedNucleotideSequences": {},
            "alignedAminoAcidSequences": {},
            "nucleotideInsertions": {},
            "aminoAcidInsertions": {},
        },
        {
            "metadata": {
                "accessionVersion": "REV_2.1",
                "accession": "REV_2",
                "version": 1,
                "sampleCollectionDate": "2024-02-01",
                "organismKey": "virus-b",
                "organism": "Virus B",
                "clade": "A2",
            },
            "unalignedNucleotideSequences": {},
            "alignedNucleotideSequences": {},
            "alignedAminoAcidSequences": {},
            "nucleotideInsertions": {},
            "aminoAcidInsertions": {},
        },
    ]
    assert runner.current_etags == {"virus-a": '"a"', "virus-b": '"b"'}
    assert not responses_list


def test_overview_runner_skips_when_all_sources_not_modified(tmp_path: Path) -> None:
    config = make_config(tmp_path)
    paths = make_paths(tmp_path)
    paths.ensure_directories()
    mock_download, responses_list = make_mock_download_func(
        [MockHttpResponse(status=304, headers={}), MockHttpResponse(status=304, headers={})]
    )

    runner = OverviewImporterRunner(config, paths, download_func=mock_download)
    runner.current_etags = {"virus-a": '"a"', "virus-b": '"b"'}
    runner.last_hard_refresh = 9999999999
    runner.run_once()

    assert not paths.silo_input_data_path.exists()
    assert not responses_list


def test_overview_runner_refetches_all_sources_on_partial_change(tmp_path: Path) -> None:
    config = make_config(tmp_path)
    paths = make_paths(tmp_path)
    paths.ensure_directories()
    mock_download, responses_list = make_mock_download_func(
        [
            MockHttpResponse(status=304, headers={}),
            MockHttpResponse(
                status=200,
                headers={"ETag": '"new-b"'},
                body=compress_ndjson([{"metadata": {"accessionVersion": "partial.1"}}]),
            ),
            MockHttpResponse(
                status=200,
                headers={"ETag": '"new-a"'},
                body=compress_ndjson([{"metadata": {"accessionVersion": "full-a.1"}}]),
            ),
            MockHttpResponse(
                status=200,
                headers={"ETag": '"new-b"'},
                body=compress_ndjson([{"metadata": {"accessionVersion": "full-b.1"}}]),
            ),
        ]
    )

    runner = OverviewImporterRunner(config, paths, download_func=mock_download)
    runner.current_etags = {"virus-a": '"old-a"', "virus-b": '"old-b"'}
    runner.last_hard_refresh = 9999999999
    with patch.object(runner.silo, "run_preprocessing"), patch(
        "silo_import.overview.transform_data_format",
        lambda data_path, transformed_path: transformed_path.write_bytes(data_path.read_bytes()),
    ):
        runner.run_once()

    records = read_ndjson_file(paths.silo_input_data_path)
    assert [record["metadata"]["accessionVersion"] for record in records] == [
        "full-a.1",
        "full-b.1",
    ]
    assert runner.current_etags == {"virus-a": '"new-a"', "virus-b": '"new-b"'}
    assert not responses_list
