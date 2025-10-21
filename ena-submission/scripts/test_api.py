# ruff: noqa: S101 (allow asserts in tests)

import unittest
from unittest.mock import Mock, patch

from ena_deposition.api import app
from ena_deposition.config import Config, get_config
from ena_deposition.db_helper import db_init
from fastapi.testclient import TestClient
from requests.status_codes import codes

client = TestClient(app)

# Sample mock return values
mock_insdc_accessions = {
    "ABC123": ["INS001", "INS002"],
    "DEF456": ["INS003"],
}

mock_biosamples = {
    "ABC123": "BIO001",
    "DEF456": "BIO002",
}

config_file = "./test/test_config.yaml"


class ApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.config: Config = get_config(config_file)
        self.db_config = db_init(
            self.config.db_password, self.config.db_username, self.config.db_url
        )

    @patch("ena_deposition.api.get_insdc_accessions")
    @patch("ena_deposition.api.get_bio_sample_accessions")
    def test_submit(
        self, mock_get_bio_sample_accessions: Mock, mock_get_insdc_accessions: Mock
    ) -> None:
        """
        Test the full ENA submission pipeline with accurate data - this should succeed
        """
        mock_get_bio_sample_accessions.return_value = mock_biosamples
        mock_get_insdc_accessions.return_value = mock_insdc_accessions

        app.state.config = self.config

        response = client.get("/submitted")

        assert response.status_code == codes.ok
        assert response.json() == {
            "status": "ok",
            "insdcAccessions": ["INS001", "INS002", "INS003"],
            "biosampleAccessions": list(mock_biosamples.values()),
        }


if __name__ == "__main__":
    import pytest

    pytest.main([__file__])
