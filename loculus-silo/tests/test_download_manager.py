# ruff: noqa: S101
from __future__ import annotations

from pathlib import Path
from unittest.mock import Mock

import pytest
import requests
from silo_import.config import ImporterConfig
from silo_import.download_manager import (
    CONNECT_TIMEOUT_SECONDS,
    DownloadManager,
    HttpResponse,
    _download_file,  # noqa: PLC2701
)
from silo_import.errors import NotModifiedError
from silo_import.paths import ImporterPaths

READ_TIMEOUT_SECONDS = 1234


def test_download_file_keeps_connect_timeout_short(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = Mock()
    session.headers = {}
    response = Mock()
    response.raw.stream.return_value = []
    response.headers = {}
    session.get.return_value = response
    monkeypatch.setattr(requests, "Session", lambda: session)

    _download_file(
        "http://backend/get-released-data",
        tmp_path / "data.zst",
        read_timeout=READ_TIMEOUT_SECONDS,
    )

    session.get.assert_called_once_with(
        "http://backend/get-released-data",
        timeout=(CONNECT_TIMEOUT_SECONDS, READ_TIMEOUT_SECONDS),
        stream=True,
    )


def test_download_manager_applies_configured_read_timeout(tmp_path: Path) -> None:
    seen_timeouts: list[int] = []

    def download(
        _url: str,
        output_path: Path,
        _etag: str | None,
        timeout: int,
    ) -> HttpResponse:
        seen_timeouts.append(timeout)
        output_path.write_bytes(b"")
        return HttpResponse(status_code=304, headers={})

    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions=None,
        hard_refresh_interval=3600,
        poll_interval=30,
        silo_run_timeout=3600,
        download_timeout=READ_TIMEOUT_SECONDS,
        root_dir=tmp_path,
        silo_binary=tmp_path / "silo",
        preprocessing_config=tmp_path / "config.yaml",
    )
    paths = ImporterPaths.from_root(
        tmp_path,
        config.silo_binary,
        config.preprocessing_config,
    )
    paths.ensure_directories()

    with pytest.raises(NotModifiedError):
        DownloadManager(download_func=download).download_release(config, paths, last_etag="0")

    assert seen_timeouts == [READ_TIMEOUT_SECONDS]
