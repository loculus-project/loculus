from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

import loculus_client

CONFIG = loculus_client.Config(
    organism="cchf",
    backend_url="http://backend",
    keycloak_token_url="http://keycloak",
    keycloak_client_id="client",
    username="user",
    password="password",
    group_name="group",
    nucleotide_sequences=["main"],
    segmented=False,
    batch_chunk_size=1000,
)
READ_1 = {"name": "ERR1_1.fastq.gz", "url": "https://ena/ERR1_1.fastq.gz", "size": 10}
READ_2 = {"name": "ERR1_2.fastq.gz", "url": "https://ena/ERR1_2.fastq.gz", "size": 11}


def write_metadata(path: Path, rows: list[dict[str, str]]) -> str:
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, list(rows[0]), delimiter="\t")
        writer.writeheader()
        writer.writerows(rows)
    return str(path)


def registration_response(_method, _url, _config, params, json_body):
    assert params == {"groupId": "1"}
    response = mock.Mock()
    response.json.return_value = [
        {"fileId": f"FILE_{item['url'].rsplit('/', 1)[-1][:6]}", "url": item["url"]}
        for item in json_body
    ]
    return response


def test_metadata_without_file_columns_is_submitted_unchanged(tmp_path: Path) -> None:
    metadata = write_metadata(tmp_path / "metadata.tsv", [{"id": "A", "country": "Peru"}])

    with mock.patch.object(loculus_client, "make_request") as make_request:
        assert loculus_client.resolve_external_files(metadata, CONFIG, "1") == metadata

    make_request.assert_not_called()


def test_external_files_are_registered_and_replaced_by_file_ids(tmp_path: Path) -> None:
    metadata = write_metadata(
        tmp_path / "metadata.tsv",
        [
            {"id": "A", "files.rawReads": json.dumps([READ_1, READ_2]), "authors": 'Smith, "J"'},
            {"id": "B", "files.rawReads": "", "authors": ""},
        ],
    )

    with mock.patch.object(
        loculus_client, "make_request", side_effect=registration_response
    ) as make_request:
        resolved = loculus_client.resolve_external_files(metadata, CONFIG, "1")

    make_request.assert_called_once()
    assert make_request.call_args.args[1] == "http://backend/files/register-external"
    assert make_request.call_args.kwargs["json_body"] == [
        {"url": READ_1["url"], "size": READ_1["size"]},
        {"url": READ_2["url"], "size": READ_2["size"]},
    ]
    with open(resolved, encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file, delimiter="\t"))
    assert rows == [
        {
            "id": "A",
            "files.rawReads": "ERR1_1.fastq.gz:FILE_ERR1_1 ERR1_2.fastq.gz:FILE_ERR1_2",
            "authors": 'Smith, "J"',
        },
        {"id": "B", "files.rawReads": "", "authors": ""},
    ]
