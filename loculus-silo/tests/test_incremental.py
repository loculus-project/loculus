# ruff:file-ignore[assert]
from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from unittest.mock import call, patch

import pytest
import yaml
import zstandard
from helpers import (
    MockHttpResponse,
    compress_ndjson,
    make_mock_download_func,
    mock_records,
)
from rhydb import Database
from silo_import import lineage
from silo_import.config import ImporterConfig
from silo_import.download_manager import DownloadManager, HttpResponse
from silo_import.paths import ImporterPaths
from silo_import.runner import ImporterRunner
from silo_import.transformer import transform_data_format

CHANGES = "get-released-data-changes"
HOST_TAXON = "hostTaxonId"
HEAD = MockHttpResponse(status=200, headers={})
FULL_REBUILD = [call(5)]


@pytest.fixture(autouse=True)
def hierarchy_service(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(lineage, "fetch_updated_hierarchy", lambda *_: None)


def released(hashes: dict[str, str], taxon: str = "9606") -> list[dict]:
    records = []
    for record, (accession_version, record_hash) in zip(
        mock_records(), hashes.items(), strict=False
    ):
        record["metadata"] |= {
            "accessionVersion": accession_version,
            "revision": record_hash,
            HOST_TAXON: taxon,
        }
        records.append({"hash": record_hash, **record})
    return records


def changes(etag: str, records: list[dict], total: int) -> MockHttpResponse:
    return MockHttpResponse(
        status=200,
        headers={"ETag": etag, "x-total-records": str(total)},
        body=compress_ndjson(records),
    )


def make_runner(tmp_path: Path) -> ImporterRunner:
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions=None,
        hard_refresh_interval=1000,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
        silo_binary=tmp_path / "silo",
        preprocessing_config=tmp_path / "config.yaml",
        hierarchical_filters={HOST_TAXON: "http://taxonomy"},
        incremental=True,
    )
    paths = ImporterPaths.from_root(tmp_path, config.silo_binary, config.preprocessing_config)
    return ImporterRunner(config, paths)


def run_cycle(
    runner: ImporterRunner,
    responses: list[MockHttpResponse],
    preprocessing: Callable[..., None] | Exception | None = None,
) -> tuple[list[tuple], list]:
    mock_download, remaining = make_mock_download_func(responses)
    requests: list[tuple] = []

    def download(
        url: str,
        output_path: Path,
        etag: str | None = None,
        timeout: int = 300,
        method: str = "GET",
        body: dict[str, str] | None = None,
    ) -> HttpResponse:
        endpoint = url.rsplit("/", 1)[1].removesuffix("?compression=zstd")
        requests.append((method, endpoint, body if method == "POST" else etag))
        return mock_download(url, output_path, etag, timeout)

    runner.download_manager = DownloadManager(download_func=download)
    with patch.object(runner.silo, "run_preprocessing", side_effect=preprocessing) as mock:
        runner.run_once()
    assert not remaining
    return requests, mock.call_args_list


def start(tmp_path: Path, hashes: dict[str, str]) -> ImporterRunner:
    runner = make_runner(tmp_path)
    run_cycle(runner, [HEAD, changes('W/"1"', released(hashes), len(hashes))])
    return runner


def test_start_and_hard_refresh_request_all_records(tmp_path: Path) -> None:
    runner = make_runner(tmp_path)

    requests, preprocessing = run_cycle(
        runner, [HEAD, changes('W/"1"', released({"A.1": "1", "B.1": "1"}), 2)]
    )

    assert requests == [("HEAD", CHANGES, "0"), ("POST", CHANGES, {})]
    assert preprocessing == FULL_REBUILD
    assert runner.record_hashes == {"A.1": "1", "B.1": "1"}
    assert runner.current_etag == 'W/"1"'

    runner.last_hard_refresh = 0
    requests, preprocessing = run_cycle(
        runner, [HEAD, changes('W/"2"', released({"A.1": "1", "B.1": "1"}), 2)]
    )

    assert requests == [("HEAD", CHANGES, "0"), ("POST", CHANGES, {})]
    assert preprocessing == FULL_REBUILD
    assert runner.record_hashes == {"A.1": "1", "B.1": "1"}


def test_unchanged_data_skips_the_cycle_and_keeps_the_state(tmp_path: Path) -> None:
    runner = start(tmp_path, {"A.1": "1", "B.1": "1"})
    unchanged = MockHttpResponse(
        status=200,
        headers={"ETag": 'W/"2"', "x-total-records": "2"},
        body=zstandard.ZstdCompressor().compress(b""),
    )

    requests, preprocessing = run_cycle(runner, [MockHttpResponse(status=304, headers={})])

    assert requests == [("HEAD", CHANGES, 'W/"1"')]
    assert preprocessing == []
    assert runner.record_hashes == {"A.1": "1", "B.1": "1"}

    _, preprocessing = run_cycle(runner, [HEAD, unchanged])

    assert preprocessing == []
    assert runner.record_hashes == {"A.1": "1", "B.1": "1"}
    assert runner.current_etag == 'W/"2"'


def test_response_with_every_record_is_used_for_rebuild(tmp_path: Path) -> None:
    runner = start(tmp_path, {"A.1": "1", "B.1": "1"})

    requests, preprocessing = run_cycle(
        runner, [HEAD, changes('W/"2"', released({"A.1": "2", "B.1": "2"}), 2)]
    )

    assert requests[1:] == [("POST", CHANGES, {"A.1": "1", "B.1": "1"})]
    assert preprocessing == FULL_REBUILD
    assert runner.record_hashes == {"A.1": "2", "B.1": "2"}

    runner = start(tmp_path / "limit", {"A.1": "1", "B.1": "1"})
    with patch("silo_import.runner.MAX_KNOWN_HASHES", 1):
        requests, preprocessing = run_cycle(
            runner, [HEAD, changes('W/"2"', released({"A.1": "1", "B.1": "2"}), 2)]
        )
        _, unchanged = run_cycle(
            runner, [HEAD, changes('W/"3"', released({"A.1": "1", "B.1": "2"}), 2)]
        )

    assert requests[1:] == [("POST", CHANGES, {})]
    assert preprocessing == FULL_REBUILD
    assert unchanged == []
    assert runner.current_etag == 'W/"3"'


def test_record_count_mismatch_rebuilds(tmp_path: Path) -> None:
    runner = start(tmp_path, {"A.1": "1", "B.1": "1"})

    requests, preprocessing = run_cycle(
        runner,
        [
            HEAD,
            changes('W/"2"', released({"C.1": "1"}), 2),
            changes('W/"2"', released({"B.1": "1", "C.1": "1"}), 2),
        ],
    )

    assert requests[1:] == [("POST", CHANGES, {"A.1": "1", "B.1": "1"}), ("POST", CHANGES, {})]
    assert preprocessing == FULL_REBUILD
    assert runner.record_hashes == {"B.1": "1", "C.1": "1"}


def test_new_hierarchical_filter_value_rebuilds(tmp_path: Path) -> None:
    runner = start(tmp_path, {"A.1": "1", "B.1": "1"})
    new_record = released({"C.1": "1"}, taxon="10090")

    requests, preprocessing = run_cycle(
        runner,
        [
            HEAD,
            changes('W/"2"', new_record, 3),
            changes('W/"2"', released({"A.1": "1", "B.1": "1"}) + new_record, 3),
        ],
    )

    assert requests[1:] == [("POST", CHANGES, {"A.1": "1", "B.1": "1"}), ("POST", CHANGES, {})]
    assert preprocessing == FULL_REBUILD
    assert runner.hierarchical_filter_values == {HOST_TAXON: {"9606", "10090"}}


def test_failed_update_rebuilds_in_next_cycle(tmp_path: Path) -> None:
    runner = start(tmp_path, {"A.1": "1", "B.1": "1"})

    with pytest.raises(RuntimeError, match="exit code 1"):
        run_cycle(
            runner,
            [HEAD, changes('W/"2"', released({"C.1": "1"}), 3)],
            RuntimeError("SILO preprocessing failed with exit code 1"),
        )

    assert runner.record_hashes is None
    assert runner.current_etag == 'W/"1"'

    requests, preprocessing = run_cycle(
        runner, [HEAD, changes('W/"2"', released({"A.1": "1", "B.1": "1", "C.1": "1"}), 3)]
    )

    assert requests == [("HEAD", CHANGES, 'W/"1"'), ("POST", CHANGES, {})]
    assert preprocessing == FULL_REBUILD

    with patch("silo_import.runner.shutil.copyfile", side_effect=OSError), pytest.raises(OSError):
        run_cycle(
            runner, [HEAD, changes('W/"3"', released({"A.1": "2", "B.1": "2", "C.1": "2"}), 3)]
        )

    assert runner.record_hashes is None


def sequence_record(accession_version: str, country: str, sequence: str = "ATCG") -> dict:
    return {
        "hash": country + sequence,
        "metadata": {"accessionVersion": accession_version, "country": country},
        "unalignedNucleotideSequences": {"main": sequence},
        "alignedNucleotideSequences": {"main": sequence},
        "alignedAminoAcidSequences": {"gene1": "MYKW"},
        "nucleotideInsertions": {"main": []},
        "aminoAcidInsertions": {"gene1": []},
    }


def make_database_runner(tmp_path: Path) -> ImporterRunner:
    runner = make_runner(tmp_path)
    input_dir = runner.paths.input_dir
    schema = {
        "instanceName": "test",
        "metadata": [
            {"name": "accessionVersion", "type": "string"},
            {"name": "country", "type": "string", "generateIndex": True},
        ],
        "primaryKey": "accessionVersion",
    }
    reference_genomes = {
        "nucleotideSequences": [{"name": "main", "sequence": "ATCG"}],
        "genes": [{"name": "gene1", "sequence": "MYKW"}],
    }
    preprocessing_config = {
        "inputDirectory": str(input_dir),
        "outputDirectory": str(runner.paths.output_dir),
        "ndjsonInputFilename": "data.ndjson.zst",
        "referenceGenomeFilename": "reference_genomes.json",
    }
    (input_dir / "database_config.yaml").write_text(yaml.safe_dump({"schema": schema}))
    (input_dir / "reference_genomes.json").write_text(json.dumps(reference_genomes))
    runner.config.preprocessing_config.write_text(yaml.safe_dump(preprocessing_config))
    return runner


def import_records(runner: ImporterRunner, etag: str, records: list[dict], total: int) -> list:
    _, preprocessing = run_cycle(
        runner, [HEAD, changes(etag, records, total)], runner.silo.run_preprocessing
    )
    return preprocessing


def read_database(runner: ImporterRunner) -> dict:
    database = Database(str(runner.paths.output_dir))
    data = database.query("data").to_pydict()
    mutation = "nucleotideEquals(position:=3, symbol:='G', sequenceName:='main')"
    return {
        "rows": sorted(zip(*(data[column] for column in sorted(data)), strict=True)),
        "country": len(database.get_filtered_bitmap("data", "country = 'DE'")),
        "mutation": len(database.get_filtered_bitmap("data", mutation)),
    }


def test_incremental_update_matches_full_rebuild(tmp_path: Path) -> None:
    unchanged = sequence_record("A.1", "CH")
    changed = [sequence_record("B'.1", "DE", "ATGG"), sequence_record("C.1", "FR")]

    incremental = make_database_runner(tmp_path / "incremental")
    import_records(incremental, 'W/"1"', [unchanged, sequence_record("B'.1", "CH")], 2)
    update = import_records(incremental, 'W/"2"', changed, 3)
    full = make_database_runner(tmp_path / "full")
    import_records(full, 'W/"2"', [unchanged, *changed], 3)

    assert update != FULL_REBUILD
    database = read_database(incremental)
    assert database == read_database(full)
    assert (len(database["rows"]), database["country"], database["mutation"]) == (3, 1, 1)


def test_update_with_unexpected_row_count_saves_nothing(tmp_path: Path) -> None:
    runner = make_database_runner(tmp_path)
    import_records(runner, 'W/"1"', [sequence_record("A.1", "CH")], 1)
    (tmp_path / "changes.ndjson.zst").write_bytes(compress_ndjson([sequence_record("B.1", "DE")]))
    transform_data_format(tmp_path / "changes.ndjson.zst", tmp_path / "data.ndjson.zst")

    with pytest.raises(RuntimeError, match="exit code 1"):
        runner.silo.run_preprocessing(60, changes=tmp_path / "data.ndjson.zst", total_records=3)

    assert len(list(runner.paths.output_dir.iterdir())) == 1
    assert len(read_database(runner)["rows"]) == 1
