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

    def _post(self, tax_ids, params=None):
        return client.post(
            "/silo-lineage",
            json={"tax_ids": [str(t) for t in tax_ids]},
            params=params,
        )

    def test_returns_full_ancestry_for_single_taxon(self):
        homo_sapiens = mock_taxa["Homo sapiens"]
        response = self._post([homo_sapiens["tax_id"]])

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert set(lineage.keys()) == {"1", "131567", "9605", "9606"}

    def test_root_always_included_with_no_parents(self):
        homo = mock_taxa["Homo"]
        response = self._post([homo["tax_id"]])

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert "1" in lineage
        assert lineage["1"]["parents"] == []

    def test_parent_relationships_preserved(self):
        homo_sapiens = mock_taxa["Homo sapiens"]
        response = self._post([homo_sapiens["tax_id"]])

        lineage = yaml.safe_load(response.text)
        assert lineage["9606"]["parents"] == ["9605"]
        assert lineage["9605"]["parents"] == ["131567"]
        assert lineage["131567"]["parents"] == ["1"]

    def test_alias_includes_common_name_when_present(self):
        homo = mock_taxa["Homo"]
        response = self._post([homo["tax_id"]])

        lineage = yaml.safe_load(response.text)
        assert lineage["9605"]["aliases"] == ["Taxon 9605: Homo; humans"]

    def test_alias_omits_common_name_when_absent(self):
        homo_sapiens = mock_taxa["Homo sapiens"]
        response = self._post([homo_sapiens["tax_id"]])

        lineage = yaml.safe_load(response.text)
        assert lineage["9606"]["aliases"] == ["Taxon 9606: Homo sapiens"]

    def test_empty_tax_ids_returns_root_only(self):
        response = self._post([])

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert set(lineage.keys()) == {"1"}

    def test_non_numeric_tax_id_returns_422(self):
        response = client.post("/silo-lineage", json={"tax_ids": ["not-a-number"]})

        assert response.status_code == codes.unprocessable_entity
        assert "Input should be a valid integer" in response.json()["detail"][0]["msg"]

    def test_missing_taxon_attached_to_root_with_placeholder_alias(self):
        response = self._post([mock_missing_taxon])

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert lineage[str(mock_missing_taxon)]["parents"] == ["1"]
        assert lineage[str(mock_missing_taxon)]["aliases"] == [
            f"Taxon {mock_missing_taxon}"
        ]

    def test_prune_reattaches_descendant_to_nearest_kept_ancestor(self):
        # Spanning tree for Homo sapiens is {1, 131567, 9605, 9606}.
        # With prune=true, only the requested taxa + root are kept (1 and 9606),
        # so 9606 should reattach directly to 1.
        homo_sapiens = mock_taxa["Homo sapiens"]
        response = self._post([homo_sapiens["tax_id"]], params={"prune": "true"})

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert set(lineage.keys()) == {"1", "9606"}
        assert lineage["9606"]["parents"] == ["1"]

    def test_returns_413_when_response_exceeds_threshold(self):
        with patch("taxonomy_service.api.LARGE_FILE_THRESHOLD", 10):
            response = self._post([mock_taxa["Homo sapiens"]["tax_id"]])

        assert response.status_code == codes.request_entity_too_large

    def test_allow_large_bypasses_size_guard(self):
        with patch("taxonomy_service.api.LARGE_FILE_THRESHOLD", 10):
            response = self._post(
                [mock_taxa["Homo sapiens"]["tax_id"]],
                params={"allow_large": "true"},
            )

        assert response.status_code == codes.ok
        lineage = yaml.safe_load(response.text)
        assert "9606" in lineage
