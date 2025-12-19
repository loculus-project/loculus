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
            error_msg = (
                f"Invalid NDJSON from {url}\n"
                f"request_id={request_id}\n"
                f"line={pbar.n + 1}\n"
                f"json_error={e}\n"
            )

            logger.error(error_msg)
            raise RuntimeError(error_msg) from e

# Test setup
def test_fetch_success():
    data = [{"metadata": {"id": 1}, "unalignedNucleotideSequences": "seq1", "extra": "ignore"},
            {"metadata": {"id": 2}, "unalignedNucleotideSequences": "seq2", "extra": "ignore"}]

    # Create zstd content
    cctx = zstd.ZstdCompressor()
    compressed_data = b""
    for record in data:
        compressed_data += json.dumps(record).encode("utf-8") + b"\n"
    compressed_data = cctx.compress(compressed_data)

    # Mock response
    mock_response = MagicMock()
    mock_response.status_code = 200
    from io import BytesIO
    mock_response.raw = BytesIO(compressed_data)

    with patch("requests.get", return_value=mock_response) as mock_get:
        mock_get.return_value.__enter__.return_value = mock_response

        results = list(fetch_released_entries(Config(), "test-organism"))

        print(f"Got {len(results)} results")
        assert len(results) == 2

def test_fetch_error():
    # Create zstd content with BAD JSON
    cctx = zstd.ZstdCompressor()
    compressed_data = b'{"metadata": 1}\nBAD_LINE\n{"metadata": 2}\n'
    compressed_data = cctx.compress(compressed_data)

    mock_response = MagicMock()
    mock_response.status_code = 200
    from io import BytesIO
    mock_response.raw = BytesIO(compressed_data)

    with patch("requests.get", return_value=mock_response) as mock_get:
        mock_get.return_value.__enter__.return_value = mock_response

        try:
            results = list(fetch_released_entries(Config(), "test-organism"))
            print("Should have raised RuntimeError")
        except RuntimeError as e:
            print(f"Caught expected error: {e}")
            assert "line=2" in str(e)

if __name__ == "__main__":
    print("Test Success Case:")
    test_fetch_success()
    print("\nTest Error Case:")
    test_fetch_error()
