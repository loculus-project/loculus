# ruff: noqa: S101 (allow asserts in tests))
import json
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import get_ena_submission_list as get_ena_submission_list_mod

CONFIG_FILE = "./test/test_config.yaml"
GET_RELEASED_ENTRIES_PATH = "./test/get-released-data.ndjson"

APPROVED_RELEASED_DATA_PATH = "./test/approved_ena_submission_list_test.json"


def diff(a, b, path=""):
    changes = []

    if not isinstance(a, type(b)):
        changes.append((path, f"type: {type(a).__name__} -> {type(b).__name__}"))
        return changes

    if isinstance(a, dict):
        for k in a.keys() - b.keys():
            changes.append((f"{path}.{k}", "removed"))
        for k in b.keys() - a.keys():
            changes.append((f"{path}.{k}", "added"))
        for k in a.keys() & b.keys():
            changes += diff(a[k], b[k], f"{path}.{k}" if path else k)
    elif isinstance(a, list):
        if len(a) != len(b):
            changes.append((path, f"list length: {len(a)} -> {len(b)}"))
        for i, (ai, bi) in enumerate(zip(a, b, strict=False)):
            changes += diff(ai, bi, f"{path}[{i}]")
    if a != b:
        changes.append((path, f"value: {a!r} -> {b!r}"))

    return changes


def json_diff(path_a, path_b):
    with open(path_a, encoding="utf-8") as fa, open(path_b, encoding="utf-8") as fb:
        a = json.load(fa)
        b = json.load(fb)

    changes = diff(a, b)
    for p, msg in changes:
        print(f"{p or '<root>'}: {msg}")  # noqa: T201
    return not changes


def fake_fetch_released_entries(config, organism) -> Iterator[dict[str, Any]]:  # noqa: ARG001
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
        lambda slack_config, comment: None,  # noqa: ARG005
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
    assert upload_calls[0]["message"].startswith(
        "http://localhost:8079: cchf - ENA Submission pipeline wants to submit"
    )
    assert upload_calls[1]["message"].startswith(
        "http://localhost:8079: cchf - ENA Submission pipeline found 1 sequences with ena"
    )
    assert json_diff(upload_calls[0]["path"], APPROVED_RELEASED_DATA_PATH)
