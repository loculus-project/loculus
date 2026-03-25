import sqlite3
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from requests import codes
from taxonomy_service.api import app, get_db_connection
from taxonomy_service.config import Config, get_config

client = TestClient(app)

config_file = Path(__file__).parent / "test_config.yaml"


mock_taxa = {
    "Homo sapiens": {
        "tax_id": 9606,
        "common_name": None,  # set to None for testing purposes
        "scientific_name": "Homo sapiens",
        "parent_id": 9605,
        "depth": 31,
    },
    "Homo": {
        "tax_id": 9605,
        "common_name": "humans",
        "scientific_name": "Homo",
        "parent_id": 207598,
        "depth": 30,
    },
    "cellular organisms": {
        "tax_id": 131567,
        "common_name": None,
        "scientific_name": "cellular organisms",
        "parent_id": 1,
        "depth": 1,
    },
    "root": {
        "tax_id": 1,
        "common_name": None,
        "scientific_name": "root",
        "parent_id": 1,
        "depth": 0,
    },
}

mock_missing_taxon = 123
mock_missing_name = "Nonsense nonsensi"


def get_test_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE taxonomy (tax_id INTEGER, common_name TEXT, scientific_name TEXT, parent_id INTEGER, depth INTEGER)"
    )
    data = [tuple(v.values()) for v in mock_taxa.values()]
    conn.executemany("INSERT INTO taxonomy VALUES (?, ?, ?, ?, ?)", data)
    conn.commit()
    try:
        yield conn
    finally:
        conn.close()


class ApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.config: Config = get_config(config_file)
        app.dependency_overrides[get_db_connection] = get_test_db

    def tearDown(self) -> None:
        return app.dependency_overrides.clear()

    def test_get_taxon_success(self):
        taxon = mock_taxa["Homo sapiens"]
        response = client.get(f"/taxa/{taxon['tax_id']}")
        assert response.status_code == codes.ok
        assert response.json()["scientific_name"] == taxon["scientific_name"]

    def test_get_taxon_not_found(self):
        response = client.get(f"/taxa/{mock_missing_taxon}")
        assert response.status_code == codes.not_found

    def test_query_taxon_success(self):
        taxon = mock_taxa["Homo sapiens"]
        response = client.get(f"/taxa?scientific_name={taxon['scientific_name'].replace(' ', '+')}")
        assert response.status_code == codes.ok
        assert response.json()["scientific_name"] == taxon["scientific_name"]

    def test_query_taxon_case_success(self):
        taxon = mock_taxa["Homo sapiens"]
        name_lower = taxon["scientific_name"].lower().replace(" ", "+")
        response = client.get(f"/taxa?scientific_name={name_lower}")
        assert response.status_code == codes.ok
        assert response.json()["scientific_name"] == taxon["scientific_name"]

    def test_query_taxon_not_found(self):
        response = client.get(f"/taxa?scientific_name={mock_missing_name}")
        assert response.status_code == codes.not_found

    def test_get_common_name_direct_hit(self):
        homo = mock_taxa["Homo"]
        response = client.get(f"/taxa/{homo['tax_id']}?find_common_name=true")
        assert response.status_code == codes.ok
        assert response.json()["tax_id"] == homo["tax_id"]
        assert response.json()["common_name"] == homo["common_name"]

    def test_get_common_name_walk_tree(self):
        homo_sapiens = mock_taxa["Homo sapiens"]
        homo = mock_taxa["Homo"]
        response = client.get(f"/taxa/{homo_sapiens['tax_id']}?find_common_name=true")
        assert response.status_code == codes.ok
        assert response.json()["tax_id"] == homo["tax_id"]
        assert response.json()["common_name"] == homo["common_name"]

    def test_get_common_name_not_found(self):
        cellular_organisms = mock_taxa["cellular organisms"]
        response = client.get(f"/taxa/{cellular_organisms['tax_id']}?find_common_name=true")
        assert response.status_code == codes.not_found
        assert (
            response.json()["detail"]
            == f"Unable to find common name for taxon {cellular_organisms['tax_id']}"
        )
