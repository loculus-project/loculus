# ruff: noqa: S101 (allow asserts in tests))
import json
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any
import unittest
from unittest.mock import Mock, patch

import get_ena_submission_list
import orjsonl
from deepdiff import DeepDiff

CONFIG_FILE = "./test/test_config.yaml"
GET_RELEASED_ENTRIES_PATH = "./test/get-released-data.ndjson"

APPROVED_RELEASED_DATA_PATH = "./test/approved_ena_submission_list_test.json"


def json_diff(path_a, path_b):
    with open(path_a, encoding="utf-8") as fa, open(path_b, encoding="utf-8") as fb:
        a = json.load(fa)
        b = json.load(fb)

    changes = DeepDiff(a, b)
    assert not changes, f"JSON files {path_a} and {path_b} differ: {changes}"


def fake_fetch_released_entries(config, organism) -> Iterator[dict[str, Any]]:  # noqa: ARG001
    if organism != "cchf":
        return iter([])

    return (
        {k: v for k, v in record.items() if k in {"metadata", "unalignedNucleotideSequences"}}
        for record in orjsonl.stream(GET_RELEASED_ENTRIES_PATH)
    )


class GetSubmissionListTests(unittest.TestCase):
    @patch("get_ena_submission_list.fetch_released_entries")
    @patch("get_ena_submission_list.upload_file_with_comment")
    @patch("get_ena_submission_list.slack_conn_init")
    @patch("get_ena_submission_list.highest_version_in_submission_table")
    @patch("get_ena_submission_list.db_init")
    def test_happy_path_single_upload_and_file_content(
        self,
        mock_db_init: Mock,
        mock_highest_version_in_submission_table: Mock,
        mock_slack_conn_init: Mock,
        mock_upload_file_with_comment: Mock,
        mock_fetch_released_entries: Mock,
    ):
        # Mock database calls, adding a LOC_submitted entry with version 1
        class DummyPool: ...

        mock_db_init.return_value = DummyPool()
        mock_highest_version_in_submission_table.return_value = {"LOC_submitted": 1}

        # Mock slack connection
        slack_cfg = SimpleNamespace(
            slack_hook="dummy_hook",
            slack_token="dummy_token",  # noqa: S106
            slack_channel_id="dummy_channel",
        )
        mock_slack_conn_init.return_value = slack_cfg

        mock_upload_file_with_comment.return_value = {"ok": True}
        mock_fetch_released_entries.side_effect = fake_fetch_released_entries

        get_ena_submission_list.get_ena_submission_list.callback(config_file=str(CONFIG_FILE))  # type: ignore
        mock_upload_file_with_comment.assert_called()
        mock_upload_file_with_comment.assert_any_call(
            ANY,
            "cchf_ena_submission_list.json",
            "http://localhost:8079: cchf - ENA Submission pipeline wants to submit 1 sequences",
        )
        assert mock_upload_file_with_comment.call_args.args[2].startswith(
            "http://localhost:8079: cchf - ENA Submission pipeline found 1 sequences with ena"
        )
        json_diff(
            mock_upload_file_with_comment.call_args_list[0].args[1], APPROVED_RELEASED_DATA_PATH
        )


if __name__ == "__main__":
    unittest.main()
