# ruff: noqa: S101 (allow asserts in tests)

import unittest
from unittest.mock import Mock, patch

from ena_deposition.api import app, get_run_accessions
from ena_deposition.config import Config, get_config
from ena_deposition.submission_db_helper import RawReadsTableEntry, Status, db_init
from fastapi.testclient import TestClient
from requests.status_codes import codes
from sqlalchemy import delete
from sqlalchemy.orm import Session

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

mock_runs = {
    "ABC123": "ERR001",
}

config_file = "./test/test_config.yaml"


class ApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.config: Config = get_config(config_file)
        self.db_engine = db_init(
            self.config.db_password, self.config.db_username, self.config.db_url
        )

    @patch("ena_deposition.api.get_run_accessions")
    @patch("ena_deposition.api.get_insdc_accessions")
    @patch("ena_deposition.api.get_bio_sample_accessions")
    def test_submit(
        self,
        mock_get_bio_sample_accessions: Mock,
        mock_get_insdc_accessions: Mock,
        mock_get_run_accessions: Mock,
    ) -> None:
        """
        Test the full ENA submission pipeline with accurate data - this should succeed
        """
        mock_get_bio_sample_accessions.return_value = mock_biosamples
        mock_get_insdc_accessions.return_value = mock_insdc_accessions
        mock_get_run_accessions.return_value = mock_runs

        app.state.config = self.config
        app.state.engine = self.db_engine

        response = client.get("/submitted")

        assert response.status_code == codes.ok
        assert response.json() == {
            "status": "ok",
            "insdcAccessions": ["INS001", "INS002", "INS003"],
            "biosampleAccessions": list(mock_biosamples.values()),
            "runAccessions": ["ERR001"],
        }

    def test_get_run_accessions_returns_only_submitted_runs(self) -> None:
        accessions = ["LOC_RUN1", "LOC_RUN2", "LOC_RUN3"]
        rows = [
            RawReadsTableEntry(
                accession="LOC_RUN1",
                version=1,
                status=Status.SUBMITTED,
                result={"run_accession": "ERR001", "erx_accession": "ERX001"},
            ),
            RawReadsTableEntry(
                accession="LOC_RUN2", version=1, status=Status.READY, result={"run_accession": "X"}
            ),
            RawReadsTableEntry(accession="LOC_RUN3", version=1, status=Status.SUBMITTED),
        ]
        with Session(self.db_engine) as session:
            session.add_all(rows)
            session.commit()
        try:
            assert get_run_accessions(self.db_engine) == {"LOC_RUN1": "ERR001"}
        finally:
            with Session(self.db_engine) as session:
                session.execute(
                    delete(RawReadsTableEntry).where(RawReadsTableEntry.accession.in_(accessions))
                )
                session.commit()


if __name__ == "__main__":
    import pytest

    pytest.main([__file__])
