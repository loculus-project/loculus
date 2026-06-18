# ruff: noqa: S101
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from helpers import MockHttpResponse, compress_ndjson, make_mock_download_func, read_ndjson_file
from silo_import.overview import OverviewImporterConfig, OverviewImporterRunner
from silo_import.paths import ImporterPaths


def make_config(tmp_path: Path) -> OverviewImporterConfig:
    query_file = tmp_path / "overview_query.sql"
    query_file.write_text(
        """
select accessionVersion, accession, version,
       geoLocCountry as country, sampleCollectionDate as date, 'virus-a' as organism
from "virus-a"
union all
select accessionVersion, accession, version,
       country as country, date as date, 'virus-b' as organism
from "virus-b"
""".strip(),
        encoding="utf-8",
    )
    database_config = tmp_path / "database_config.yaml"
    database_config.write_text(
        """
schema:
  metadata:
    - name: accessionVersion
      type: string
    - name: accession
      type: string
    - name: version
      type: int
    - name: country
      type: string
    - name: date
      type: string
    - name: organism
      type: string
""".strip(),
        encoding="utf-8",
    )
    return OverviewImporterConfig(
        backend_base_urls={
            "virus-a": "http://backend/virus-a",
            "virus-b": "http://backend/virus-b",
        },
        organism_display_names={"virus-a": "Virus A", "virus-b": "Virus B"},
        query_file=query_file,
        database_config=database_config,
        hard_refresh_interval=1000,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
        silo_binary=tmp_path / "silo",
        preprocessing_config=tmp_path / "config.yaml",
        sequence_config_file=tmp_path / "view_sequence_config.json",
    )


def make_paths(tmp_path: Path) -> ImporterPaths:
    return ImporterPaths.from_root(tmp_path, tmp_path / "silo", tmp_path / "config.yaml")


def flatten_metadata_transform(data_path: Path, transformed_path: Path) -> None:
    records = []
    for record in read_ndjson_file(data_path):
        records.append(record["metadata"])

    transformed_path.write_bytes(compress_ndjson(records))


def flatten_metadata_and_sequences_transform(data_path: Path, transformed_path: Path) -> None:
    records = []
    for record in read_ndjson_file(data_path):
        transformed = dict(record["metadata"])
        for segment, sequence in record.get("unalignedNucleotideSequences", {}).items():
            transformed[f"unaligned_{segment}"] = sequence
        records.append(transformed)

    transformed_path.write_bytes(compress_ndjson(records))


def test_overview_runner_executes_sql_view_query(tmp_path: Path) -> None:
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
                            "geoLocCountry": "Germany",
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
                            "version": "2",
                            "date": "2024-02",
                            "country": "Brazil",
                            "unconfiguredField": "ignored",
                        }
                    }
                ]
            ),
        ),
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    runner = OverviewImporterRunner(config, paths, download_func=mock_download)
    with (
        patch.object(runner.silo, "run_preprocessing"),
        patch(
            "silo_import.overview.transform_data_format",
            flatten_metadata_transform,
        ),
    ):
        runner.run_once()

    assert read_ndjson_file(paths.silo_input_data_path) == [
        {
            "accessionVersion": "REV_1.1",
            "accession": "REV_1",
            "version": 1,
            "country": "Germany",
            "date": "2024-01-01",
            "organism": "virus-a",
        },
        {
            "accessionVersion": "REV_2.1",
            "accession": "REV_2",
            "version": 2,
            "country": "Brazil",
            "date": "2024-02",
            "organism": "virus-b",
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
                body=compress_ndjson(
                    [
                        {
                            "metadata": {
                                "accessionVersion": "partial.1",
                                "accession": "partial",
                                "version": 1,
                                "country": "Brazil",
                                "date": "2024",
                            }
                        }
                    ]
                ),
            ),
            MockHttpResponse(
                status=200,
                headers={"ETag": '"new-a"'},
                body=compress_ndjson(
                    [
                        {
                            "metadata": {
                                "accessionVersion": "full-a.1",
                                "accession": "full-a",
                                "version": 1,
                                "geoLocCountry": "Germany",
                                "sampleCollectionDate": "2024",
                            }
                        }
                    ]
                ),
            ),
            MockHttpResponse(
                status=200,
                headers={"ETag": '"new-b"'},
                body=compress_ndjson(
                    [
                        {
                            "metadata": {
                                "accessionVersion": "full-b.1",
                                "accession": "full-b",
                                "version": 1,
                                "country": "Brazil",
                                "date": "2024",
                            }
                        }
                    ]
                ),
            ),
        ]
    )

    runner = OverviewImporterRunner(config, paths, download_func=mock_download)
    runner.current_etags = {"virus-a": '"old-a"', "virus-b": '"old-b"'}
    runner.last_hard_refresh = 9999999999
    with (
        patch.object(runner.silo, "run_preprocessing"),
        patch(
            "silo_import.overview.transform_data_format",
            flatten_metadata_transform,
        ),
    ):
        runner.run_once()

    records = read_ndjson_file(paths.silo_input_data_path)
    assert [record["accessionVersion"] for record in records] == [
        "full-a.1",
        "full-b.1",
    ]
    assert runner.current_etags == {"virus-a": '"new-a"', "virus-b": '"new-b"'}
    assert not responses_list


def test_overview_runner_allows_empty_sources_in_sql_union(tmp_path: Path) -> None:
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
                            "accessionVersion": "non-empty.1",
                            "accession": "non-empty",
                            "version": 1,
                            "geoLocCountry": "Germany",
                            "sampleCollectionDate": "2024",
                        }
                    }
                ]
            ),
        ),
        MockHttpResponse(
            status=200,
            headers={"ETag": '"empty"'},
            body=compress_ndjson([]),
        ),
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    runner = OverviewImporterRunner(config, paths, download_func=mock_download)
    with (
        patch.object(runner.silo, "run_preprocessing"),
        patch(
            "silo_import.overview.transform_data_format",
            flatten_metadata_transform,
        ),
    ):
        runner.run_once()

    assert read_ndjson_file(paths.silo_input_data_path) == [
        {
            "accessionVersion": "non-empty.1",
            "accession": "non-empty",
            "version": 1,
            "country": "Germany",
            "date": "2024",
            "organism": "virus-a",
        },
    ]
    assert runner.current_etags == {"virus-a": '"a"', "virus-b": '"empty"'}
    assert not responses_list


def test_overview_runner_attaches_unaligned_sequences_to_query_result(tmp_path: Path) -> None:
    config = make_config(tmp_path)
    config.sequence_config_file.write_text(
        """
{
  "unalignedNucleotideSequences": {
    "enabled": true,
    "segments": ["main", "L"],
    "sourceSegments": {
      "main": {
        "virus-a": "genome"
      }
    }
  }
}
""".strip(),
        encoding="utf-8",
    )
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
                            "geoLocCountry": "Germany",
                        },
                        "unalignedNucleotideSequences": {
                            "genome": "ACGT",
                        },
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
                            "version": 2,
                            "date": "2024-02-01",
                            "country": "Brazil",
                        },
                        "unalignedNucleotideSequences": {
                            "L": "TTAA",
                        },
                    }
                ]
            ),
        ),
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    runner = OverviewImporterRunner(config, paths, download_func=mock_download)
    with (
        patch.object(runner.silo, "run_preprocessing"),
        patch(
            "silo_import.overview.transform_data_format",
            flatten_metadata_and_sequences_transform,
        ),
    ):
        runner.run_once()

    assert read_ndjson_file(paths.silo_input_data_path) == [
        {
            "accessionVersion": "REV_1.1",
            "accession": "REV_1",
            "version": 1,
            "country": "Germany",
            "date": "2024-01-01",
            "organism": "virus-a",
            "main": None,
            "unaligned_main": "ACGT",
            "L": None,
            "unaligned_L": None,
        },
        {
            "accessionVersion": "REV_2.1",
            "accession": "REV_2",
            "version": 2,
            "country": "Brazil",
            "date": "2024-02-01",
            "organism": "virus-b",
            "main": None,
            "unaligned_main": None,
            "L": None,
            "unaligned_L": "TTAA",
        },
    ]
    assert not responses_list
