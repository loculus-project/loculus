from __future__ import annotations

from unittest.mock import Mock

from loculus_cli.api.backend import (
    DEFAULT_HTTP_TIMEOUT_SECONDS,
    RELEASED_DATA_READ_TIMEOUT_SECONDS,
    BackendClient,
)


def test_get_released_data_uses_long_read_timeout() -> None:
    client = BackendClient.__new__(BackendClient)
    http_client = Mock()
    client.client = http_client
    response = Mock()
    response.content = b"released data"
    http_client.get.return_value = response

    result = client.get_released_data("mpox")

    assert result == b"released data"
    timeout = http_client.get.call_args.kwargs["timeout"]
    assert timeout.connect == DEFAULT_HTTP_TIMEOUT_SECONDS
    assert timeout.read == RELEASED_DATA_READ_TIMEOUT_SECONDS
    assert timeout.write == DEFAULT_HTTP_TIMEOUT_SECONDS
    assert timeout.pool == DEFAULT_HTTP_TIMEOUT_SECONDS
