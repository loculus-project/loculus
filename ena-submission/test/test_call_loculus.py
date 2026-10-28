# ruff: noqa: S101 (allow asserts in tests))
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from ena_deposition import call_loculus
from ena_deposition.config import Config, get_config

CONFIG_FILE = "./test/test_config.yaml"


def mock_streaming_response(lines: list[bytes]) -> MagicMock:
    response = MagicMock()
    response.__enter__.return_value = response
    response.iter_lines.return_value = lines
    response.iter_content.return_value = lines
    return response


class CallLoculusAuthenticationTests(unittest.TestCase):
    """Requests to the backend's data endpoints carry a Bearer token, so that ENA deposition
    keeps working on instances with auth.requireAuthenticationForData."""

    def setUp(self) -> None:
        self.config: Config = get_config(CONFIG_FILE)

    @patch("ena_deposition.call_loculus.get_jwt", return_value="test-token")
    @patch("ena_deposition.call_loculus.requests.get")
    def test_fetch_released_entries_sends_bearer_token(self, mock_get, _mock_get_jwt) -> None:
        mock_get.return_value = mock_streaming_response([b'{"metadata": {}}'])

        entries = list(call_loculus.fetch_released_entries(self.config, "cchf"))

        assert entries == [{"metadata": {}}]
        assert mock_get.call_args.kwargs["headers"]["Authorization"] == "Bearer test-token"

    @patch("ena_deposition.call_loculus.get_jwt", return_value="test-token")
    @patch("ena_deposition.call_loculus.requests.get")
    def test_download_file_sends_bearer_token(self, mock_get, _mock_get_jwt) -> None:
        mock_get.return_value = mock_streaming_response([b"@read\nACGT\n"])

        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "reads.fastq.gz"
            call_loculus.download_file("http://backend/files/get/x", str(path), 10, self.config)

            assert path.read_bytes() == b"@read\nACGT\n"
        assert mock_get.call_args.kwargs["headers"] == {"Authorization": "Bearer test-token"}

    @patch("ena_deposition.call_loculus.get_jwt", return_value="test-token")
    @patch("ena_deposition.call_loculus.requests.get")
    def test_get_group_info_sends_bearer_token(self, mock_get, _mock_get_jwt) -> None:
        mock_get.return_value.ok = False
        mock_get.return_value.status_code = 401

        with self.assertRaises(Exception):  # noqa: B017
            call_loculus.get_group_info(self.config, 1)

        assert mock_get.call_args.kwargs["headers"]["Authorization"] == "Bearer test-token"


if __name__ == "__main__":
    unittest.main()
