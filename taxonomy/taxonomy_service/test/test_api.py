from pathlib import Path
import unittest
from unittest.mock import MagicMock, Mock, patch

from fastapi.testclient import TestClient
from requests import codes

from taxonomy_service.api import app
from taxonomy_service.config import Config, get_config


client = TestClient(app)

config_file = Path(__file__).parent / "test_config.yaml"

mock_scientific_name = "Aedes aegypti"
mock_missing_name = "Nonsense nonsensi"
mock_taxon = {
    "tax_id": 7159,
    "common_name": "yellow fever mosquito",
    "scientific_name": "Aedes aegypti",
    "parent_id": 53541,
    "depth": 28,
}


class ApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.mock_config: Config = MagicMock()
        self.mock_config.db_path = ":memory:"

        app.state.config = self.mock_config

    @patch("taxonomy_service.api.fetch_by_sci_name")
    def test_taxon_from_sci_name(self, mock_fetch_by_sci_name: Mock) -> None:
        mock_fetch_by_sci_name.return_value = mock_taxon

        response = client.get(f"/taxa?scientific_name={mock_scientific_name}")

        assert response.status_code == codes.ok
        assert response.json() == mock_taxon

    @patch("taxonomy_service.api.fetch_by_sci_name")
    def test_taxon_from_missing_name(self, mock_fetch_by_sci_name: Mock):
        mock_fetch_by_sci_name.return_value = None

        app.state.config = self.mock_config

        response = client.get(f"/taxa?scientific_name={mock_missing_name}")

        assert response.status_code == 404
