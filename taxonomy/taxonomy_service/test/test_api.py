from pathlib import Path
import sqlite3
import unittest
from unittest.mock import MagicMock, Mock, patch

from fastapi.testclient import TestClient
from requests import codes

from taxonomy_service.api import app, get_db_connection
from taxonomy_service.config import Config


client = TestClient(app)

config_file = Path(__file__).parent / "test_config.yaml"


def get_test_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE taxonomy (tax_id INTEGER, common_name TEXT, scientific_name TEXT, parent_id INTEGER, depth INTEGER)"
    )
    conn.execute("INSERT INTO taxonomy VALUES (9606, 'human', 'Homo sapiens', 9605, 31)")
    conn.commit()
    try:
        yield conn
    finally:
        conn.close()


app.dependency_overrides[get_db_connection] = get_test_db

mock_taxon = {
    "tax_id": 9606,
    "common_name": "human",
    "scientific_name": "Homo sapiens",
    "parent_id": 9605,
    "depth": 31,
}

mock_missing_taxon = 123
mock_missing_name = "Nonsense nonsensi"


class ApiTest(unittest.TestCase):
    def test_get_taxon_success(self):
        response = client.get(f"/taxa/{mock_taxon['tax_id']}")
        assert response.status_code == codes.ok
        assert response.json()["scientific_name"] == mock_taxon["scientific_name"]

    def test_get_taxon_not_found(self):
        response = client.get(f"/taxa/{mock_missing_taxon}")
        assert response.status_code == codes.not_found

    def test_query_taxon_succes(self):
        response = client.get(f"/taxa?name={mock_taxon['scientific_name']}")
        assert response.status_code == codes.ok
        assert response.json()["scientific_name"] == mock_taxon["scientific_name"]

    def test_query_taxon_not_found(self):
        response = client.get(f"/taxa?name={mock_missing_name}")
        assert response.status_code == codes.not_found
