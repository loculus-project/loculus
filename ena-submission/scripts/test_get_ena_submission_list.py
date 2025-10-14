import json
from types import SimpleNamespace
from typing import Any, Iterator

import get_ena_submission_list as get_ena_submission_list_mod


CONFIG_FILE = "./test/test_config.yaml"
GET_RELEASED_ENTRIES_PATH = "./test/get-released-data.ndjson"


def fake_fetch_released_entries(config, organism) -> Iterator[dict[str, Any]]:
    items = []
    with open(GET_RELEASED_ENTRIES_PATH, encoding="utf-8") as fh:
        for line in fh:
            stripped = line.strip()
            if not stripped:
                continue
            obj = json.loads(stripped)
            items.append(
                {k: v for k, v in obj.items() if k in {"metadata", "unalignedNucleotideSequences"}}
            )
    if organism == "cchf":
        return iter(items)
    return iter([])


def test_happy_path_single_upload_and_file_content(monkeypatch):
    class DummyPool: ...

    monkeypatch.setattr(get_ena_submission_list_mod, "db_init", lambda **_: DummyPool())
    monkeypatch.setattr(
        get_ena_submission_list_mod, "highest_version_in_submission_table", lambda **_: {}
    )

    slack_cfg = SimpleNamespace(
        slack_hook="dummy_hook",
        slack_token="dummy_token",  # noqa: S106
        slack_channel_id="dummy_channel",
    )
    monkeypatch.setattr(get_ena_submission_list_mod, "slack_conn_init", lambda **_: slack_cfg)
    monkeypatch.setattr(
        "get_ena_submission_list.notify",
        lambda slack_config, comment: None,
        raising=True,
    )

    upload_calls = []

    def fake_upload_file_with_comment(sc, path, message):
        upload_calls.append({"sc": sc, "path": path, "message": message})
        return {"ok": True}

    monkeypatch.setattr(
        get_ena_submission_list_mod, "upload_file_with_comment", fake_upload_file_with_comment
    )

    notify_calls = []
    monkeypatch.setattr(
        get_ena_submission_list_mod,
        "notify",
        lambda *args, **kwargs: notify_calls.append((args, kwargs)),
    )

    monkeypatch.setattr(
        "get_ena_submission_list.fetch_released_entries",
        fake_fetch_released_entries,
        raising=True,
    )

    get_ena_submission_list_mod.get_ena_submission_list.callback(config_file=str(CONFIG_FILE))
    assert upload_calls, "Expected a Slack file upload, but none happened"
    assert upload_calls[0]["message"].startswith("http://localhost:8079: cchf - ENA Submission pipeline wants to submit")
