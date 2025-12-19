import tempfile
import requests
import zstandard as zstd
import json
import os
import logging
from unittest.mock import MagicMock, patch
from collections.abc import Iterator
import shutil
import orjson
import orjsonl
from tqdm import tqdm

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Mock Config
class Config:
    backend_url = "http://mock-backend"
    username = "user"
    password = "password"
    keycloak_client_id = "client"
    keycloak_token_url = "http://mock-keycloak"
    backend_http_timeout_seconds = 3600

def organism_url(config: Config, organism: str) -> str:
    return f"{config.backend_url}/{organism}"

# New implementation copy
def fetch_released_entries(config, organism: str) -> Iterator[dict]:
    request_id = "test-id"
    url = f"{organism_url(config, organism)}/get-released-data"
    params = {"compression": "zstd"}

    headers = {
        "Content-Type": "application/json",
        "X-Request-ID": request_id,
    }
    logger.info(f"Fetching released data from {url} with request id {request_id}")

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_file_path = os.path.join(temp_dir, "downloaded_data.zst")

        with requests.get(
            url,
            headers=headers,
            params=params,
            timeout=config.backend_http_timeout_seconds,
            stream=True,
        ) as response:
            response.raise_for_status()

            response.raw.decode_content = False

            with open(temp_file_path, "wb") as f:
                shutil.copyfileobj(response.raw, f)

        try:
            wanted_keys = {"metadata", "unalignedNucleotideSequences"}
            with tqdm(orjsonl.stream(temp_file_path), unit=" records", mininterval=2.0) as pbar:
                for full_json in pbar:
                    yield {k: v for k, v in full_json.items() if k in wanted_keys}
        except orjson.JSONDecodeError as e:
            line_content = getattr(e, "doc", "")
            if len(line_content) <= 400:
                error_msg = (
                    f"Invalid NDJSON from {url}\n"
                    f"request_id={request_id}\n"
                    f"line={pbar.n + 1}\n"
                    f"json_error={e}\n"
                    f"body={line_content!r}"
                )
            else:
                head = line_content[:200]
                tail = line_content[-200:]
                error_msg = (
                    f"Invalid NDJSON from {url}\n"
                    f"request_id={request_id}\n"
                    f"line={pbar.n + 1}\n"
                    f"json_error={e}\n"
                    f"head={head!r}\n"
                    f"tail={tail!r}"
                )

            logger.error(error_msg)
            raise RuntimeError(error_msg) from e

# Test setup
def test_fetch_error_short():
    print("Testing short line...")
    cctx = zstd.ZstdCompressor()
    # Bad json at line 2, short
    bad_line = b'BAD'
    compressed_data = b'{"metadata": 1}\n' + bad_line + b'\n'
    compressed_data = cctx.compress(compressed_data)

    mock_response = MagicMock()
    mock_response.status_code = 200
    from io import BytesIO
    mock_response.raw = BytesIO(compressed_data)

    with patch("requests.get", return_value=mock_response) as mock_get:
        mock_get.return_value.__enter__.return_value = mock_response

        try:
            results = list(fetch_released_entries(Config(), "test-organism"))
        except RuntimeError as e:
            msg = str(e)
            print(f"Caught: {e}")
            # Should have body, NOT head/tail
            assert "body='BAD\\n'" in msg or 'body="BAD\\n"' in msg or "body=b'BAD\\n'" in msg
            assert "head=" not in msg
            assert "tail=" not in msg

def test_fetch_error_long():
    print("Testing long line...")
    cctx = zstd.ZstdCompressor()
    # 500 chars. Head=200. Tail=200.
    bad_line = (b'a' * 250) + (b'b' * 250)
    compressed_data = b'{"metadata": 1}\n' + bad_line + b'\n'
    compressed_data = cctx.compress(compressed_data)

    mock_response = MagicMock()
    mock_response.status_code = 200
    from io import BytesIO
    mock_response.raw = BytesIO(compressed_data)

    with patch("requests.get", return_value=mock_response) as mock_get:
        mock_get.return_value.__enter__.return_value = mock_response

        try:
            results = list(fetch_released_entries(Config(), "test-organism"))
        except RuntimeError as e:
            msg = str(e)
            # Should have head and tail, NOT body
            assert "head=" in msg
            assert "tail=" in msg
            assert "body=" not in msg
            assert "head='aaaa" in msg
            assert "tail='bbbb" in msg

if __name__ == "__main__":
    test_fetch_error_short()
    test_fetch_error_long()
