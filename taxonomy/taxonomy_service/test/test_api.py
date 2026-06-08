import sqlite3
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch

import yaml
from fastapi.testclient import TestClient
from requests import codes

from taxonomy_service.api import app, get_db_connection, init_app
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
        "parent_id": 131567,  # skipping some levels for testing purposes
        "depth": 30,
    },
    "Pan": {
        # sibling of Homo under "cellular organisms" so we can test
        # an MRCA that is not part of the input
        "tax_id": 9596,
        "common_name": "chimpanzees",
        "scientific_name": "Pan",
        "parent_id": 131567,
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
        init_app(self.config)
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
        query = urllib.parse.urlencode({"scientific_name": taxon["scientific_name"]})
        response = client.get(f"/taxa?{query}")
        assert response.status_code == codes.ok
        assert response.json()[0]["scientific_name"] == taxon["scientific_name"]

    def test_query_taxon_case_success(self):
        taxon = mock_taxa["Homo sapiens"]
        name_lower = taxon["scientific_name"].lower().replace(" ", "+")
        response = client.get(f"/taxa?scientific_name={name_lower}")
        assert response.status_code == codes.ok
        assert response.json()[0]["scientific_name"] == taxon["scientific_name"]

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
        response = client.get(
            f"/taxa/{cellular_organisms['tax_id']}?find_common_name=true"
        )
        assert response.status_code == codes.not_found
        assert (
            response.json()["detail"]
            == f"Unable to find common name for taxon {cellular_organisms['tax_id']}"
        )


class PostSiloLineageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.config: Config = get_config(config_file)
        init_app(self.config)
        app.dependency_overrides[get_db_connection] = get_test_db

    def tearDown(self) -> None:
        return app.dependency_overrides.clear()

    def _post(self, values, params=None):
        return client.post(
            "/silo-lineage",
            json={"values": [str(t) for t in values]},
            params=params,
        )

    def test_returns_expected_tree(self):
        # Homo sapiens (9606) and Pan (9596) branch at "cellular organisms" (131567),
        response = self._post([9606, 9596])

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert set(lineage.keys()) == {"1", "131567", "9605", "9596", "9606"}
        assert lineage["131567"]["parents"] == ["1"]
        assert lineage["9605"]["parents"] == ["131567"]
        assert lineage["9596"]["parents"] == ["131567"]
        assert lineage["9606"]["parents"] == ["9605"]

    def test_alias_includes_names(self):
        response = self._post([9605, 9606])

        lineage = yaml.safe_load(response.text)
        assert lineage["9605"]["aliases"] == ["Homo; humans [Taxon 9605]"]
        assert lineage["9606"]["aliases"] == ["Homo sapiens [Taxon 9606]"]

    def test_empty_tax_ids_returns_empty_lineage(self):
        response = self._post([])

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert lineage == {}

    def test_non_numeric_tax_id_returns_422(self):
        response = client.post("/silo-lineage", json={"values": ["not-a-number"]})

        assert response.status_code == codes.unprocessable_entity
        assert "Input should be a valid integer" in response.json()["detail"][0]["msg"]

    def test_missing_taxa_added_as_orphans(self):
        response = self._post([mock_missing_taxon])

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert lineage[str(mock_missing_taxon)]["parents"] == []
        assert lineage[str(mock_missing_taxon)]["aliases"] == [
            f"Taxon {mock_missing_taxon}"
        ]

        # Also if other valid taxa are provided
        response = self._post([9606, 9596, mock_missing_taxon])

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert lineage[str(mock_missing_taxon)]["parents"] == []

    def test_prune_reattaches_descendant_to_nearest_kept_ancestor(self):
        # The relevant tree is {1, 131567, 9605, 9606}.
        # With prune=true only the requested taxa (and root) are kept,
        # so 9606 should reattach directly to 131567 (skipping 9605).
        response = self._post([131567, 9606], params={"prune": "true"})

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert set(lineage.keys()) == {"1", "131567", "9606"}
        assert lineage["131567"]["parents"] == ["1"]
        assert lineage["9606"]["parents"] == ["131567"]

    def test_returns_413_when_response_exceeds_threshold(self):
        with patch("taxonomy_service.helpers.LARGE_FILE_THRESHOLD", 10):
            response = self._post([mock_taxa["Homo sapiens"]["tax_id"]])

        assert response.status_code == codes.request_entity_too_large

    def test_allow_large_bypasses_size_guard(self):
        with patch("taxonomy_service.helpers.LARGE_FILE_THRESHOLD", 10):
            response = self._post(
                [mock_taxa["Homo sapiens"]["tax_id"]],
                params={"allow_large": "true"},
            )

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert "9606" in lineage
