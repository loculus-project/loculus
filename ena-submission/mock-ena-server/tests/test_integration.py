"""Integration tests demonstrating mock ENA server with real ENA deposition code."""

import sys
from pathlib import Path

import pytest
import requests
from fastapi.testclient import TestClient
from requests.auth import HTTPBasicAuth

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from mock_ena.accessions import AccessionGenerator
from mock_ena.database import MockENADatabase
from mock_ena.server import app, configure_server


@pytest.fixture
def mock_ena_client():
    """Create a test client for the mock ENA server."""
    # Configure server with in-memory database
    configure_server(
        database_path=":memory:",
        username="test_user",
        password="test_password"
    )

    # Create test client
    with TestClient(app) as client:
        yield client


@pytest.fixture
def auth():
    """HTTP Basic Auth credentials."""
    return HTTPBasicAuth("test_user", "test_password")


def test_health_endpoint(mock_ena_client):
    """Test the health endpoint."""
    response = mock_ena_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_root_endpoint(mock_ena_client):
    """Test the root endpoint."""
    response = mock_ena_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "endpoints" in data


def test_authentication_required(mock_ena_client):
    """Test that authentication is required for submit endpoint."""
    # Create minimal submission file
    submission_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <SUBMISSION alias="test_submission">
        <ACTIONS>
            <ACTION>
                <ADD/>
            </ACTION>
        </ACTIONS>
    </SUBMISSION>"""

    # Try without authentication
    response = mock_ena_client.post(
        "/submit/drop-box/submit",
        files={"SUBMISSION": ("submission.xml", submission_xml, "application/xml")}
    )
    assert response.status_code == 401


def test_project_submission(mock_ena_client, auth):
    """Test project submission mimicking real ENA deposition code."""

    # Create PROJECT XML (similar to what create_project.py generates)
    project_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <PROJECT_SET>
        <PROJECT alias="test_project_alias">
            <TITLE>Test Project Title</TITLE>
            <DESCRIPTION>This is a test project for mock ENA server</DESCRIPTION>
            <SUBMISSION_PROJECT>
                <SEQUENCING_PROJECT>
                    <LOCUS_TAG_PREFIX/>
                </SEQUENCING_PROJECT>
            </SUBMISSION_PROJECT>
            <PROJECT_LINKS>
                <PROJECT_LINK>
                    <XREF_LINK>
                        <DB>TAXON</DB>
                        <ID>2697049</ID>
                    </XREF_LINK>
                </PROJECT_LINK>
            </PROJECT_LINKS>
        </PROJECT>
    </PROJECT_SET>"""

    # Create SUBMISSION XML
    submission_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <SUBMISSION alias="test_project_submission">
        <ACTIONS>
            <ACTION>
                <ADD/>
            </ACTION>
        </ACTIONS>
    </SUBMISSION>"""

    # Submit using requests (mimicking post_webin_with_retry)
    response = mock_ena_client.post(
        "/submit/drop-box/submit",
        auth=("test_user", "test_password"),
        files={
            "SUBMISSION": ("submission.xml", submission_xml, "application/xml"),
            "PROJECT": ("project.xml", project_xml, "application/xml"),
        }
    )

    # Verify response
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/xml"

    # Parse response XML
    response_text = response.text
    assert "RECEIPT" in response_text
    assert "success=\"true\"" in response_text
    assert "PRJEB" in response_text  # Project accession
    assert "ERA-SUBMIT-" in response_text  # Submission accession
    assert "test_project_alias" in response_text


def test_sample_submission(mock_ena_client, auth):
    """Test sample submission mimicking real ENA deposition code."""

    # Create SAMPLE XML (similar to what create_sample.py generates)
    sample_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <SAMPLE_SET>
        <SAMPLE alias="test_sample_alias">
            <TITLE>Test Sample</TITLE>
            <SAMPLE_NAME>
                <TAXON_ID>2697049</TAXON_ID>
                <SCIENTIFIC_NAME>Severe acute respiratory syndrome coronavirus 2</SCIENTIFIC_NAME>
            </SAMPLE_NAME>
            <SAMPLE_ATTRIBUTES>
                <SAMPLE_ATTRIBUTE>
                    <TAG>collection date</TAG>
                    <VALUE>2023-01-15</VALUE>
                </SAMPLE_ATTRIBUTE>
                <SAMPLE_ATTRIBUTE>
                    <TAG>geographic location (country and/or sea)</TAG>
                    <VALUE>Switzerland</VALUE>
                </SAMPLE_ATTRIBUTE>
            </SAMPLE_ATTRIBUTES>
        </SAMPLE>
    </SAMPLE_SET>"""

    # Create SUBMISSION XML
    submission_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <SUBMISSION alias="test_sample_submission">
        <ACTIONS>
            <ACTION>
                <ADD/>
            </ACTION>
        </ACTIONS>
    </SUBMISSION>"""

    # Submit
    response = mock_ena_client.post(
        "/submit/drop-box/submit",
        auth=("test_user", "test_password"),
        files={
            "SUBMISSION": ("submission.xml", submission_xml, "application/xml"),
            "SAMPLE": ("sample.xml", sample_xml, "application/xml"),
        }
    )

    # Verify response
    assert response.status_code == 200
    assert "RECEIPT" in response.text
    assert "success=\"true\"" in response.text
    assert "ERS" in response.text  # Sample accession
    assert "SAMEA" in response.text  # BioSample accession
    assert "test_sample_alias" in response.text
    assert "biosample" in response.text


def test_assembly_report_endpoint(mock_ena_client, auth):
    """Test assembly report endpoint."""

    # First, create a mock assembly using the helper endpoint
    response = mock_ena_client.post(
        "/assemblies/mock/create",
        auth=("test_user", "test_password"),
        params={
            "alias": "test_assembly",
            "study_accession": "PRJEB001000",
            "sample_accession": "ERS0002000"
        }
    )

    assert response.status_code == 200
    data = response.json()
    erz_accession = data["erz_accession"]
    gca_accession = data["gca_accession"]

    # Now query the assembly report
    response = mock_ena_client.get(
        f"/submit/report/analysis-process/{erz_accession}",
        auth=("test_user", "test_password")
    )

    assert response.status_code == 200
    assert "ASSEMBLY_REPORT" in response.text
    assert erz_accession in response.text
    assert gca_accession in response.text
    assert "COMPLETED" in response.text


def test_full_submission_workflow(mock_ena_client, auth):
    """Test complete submission workflow: Project -> Sample -> Assembly."""

    # Step 1: Submit PROJECT
    project_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <PROJECT_SET>
        <PROJECT alias="workflow_project">
            <TITLE>Workflow Test Project</TITLE>
            <DESCRIPTION>Testing full submission workflow</DESCRIPTION>
            <SUBMISSION_PROJECT>
                <SEQUENCING_PROJECT/>
            </SUBMISSION_PROJECT>
            <PROJECT_LINKS>
                <PROJECT_LINK>
                    <XREF_LINK>
                        <DB>TAXON</DB>
                        <ID>2697049</ID>
                    </XREF_LINK>
                </PROJECT_LINK>
            </PROJECT_LINKS>
        </PROJECT>
    </PROJECT_SET>"""

    submission_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <SUBMISSION alias="workflow_project_submission">
        <ACTIONS><ACTION><ADD/></ACTION></ACTIONS>
    </SUBMISSION>"""

    project_response = mock_ena_client.post(
        "/submit/drop-box/submit",
        auth=("test_user", "test_password"),
        files={
            "SUBMISSION": ("submission.xml", submission_xml, "application/xml"),
            "PROJECT": ("project.xml", project_xml, "application/xml"),
        }
    )

    assert project_response.status_code == 200
    assert "PRJEB" in project_response.text

    # Extract project accession from response
    import xml.etree.ElementTree as ET
    project_root = ET.fromstring(project_response.text)
    project_elem = project_root.find(".//PROJECT")
    project_accession = project_elem.get("accession")

    # Step 2: Submit SAMPLE
    sample_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <SAMPLE_SET>
        <SAMPLE alias="workflow_sample">
            <TITLE>Workflow Test Sample</TITLE>
            <SAMPLE_NAME>
                <TAXON_ID>2697049</TAXON_ID>
                <SCIENTIFIC_NAME>SARS-CoV-2</SCIENTIFIC_NAME>
            </SAMPLE_NAME>
        </SAMPLE>
    </SAMPLE_SET>"""

    submission_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <SUBMISSION alias="workflow_sample_submission">
        <ACTIONS><ACTION><ADD/></ACTION></ACTIONS>
    </SUBMISSION>"""

    sample_response = mock_ena_client.post(
        "/submit/drop-box/submit",
        auth=("test_user", "test_password"),
        files={
            "SUBMISSION": ("submission.xml", submission_xml, "application/xml"),
            "SAMPLE": ("sample.xml", sample_xml, "application/xml"),
        }
    )

    assert sample_response.status_code == 200
    assert "ERS" in sample_response.text

    # Extract sample accession
    sample_root = ET.fromstring(sample_response.text)
    sample_elem = sample_root.find(".//SAMPLE")
    sample_accession = sample_elem.get("accession")

    # Step 3: Create assembly (using mock endpoint since real ENA uses Webin CLI)
    assembly_response = mock_ena_client.post(
        "/assemblies/mock/create",
        auth=("test_user", "test_password"),
        params={
            "alias": "workflow_assembly",
            "study_accession": project_accession,
            "sample_accession": sample_accession
        }
    )

    assert assembly_response.status_code == 200
    assembly_data = assembly_response.json()
    erz_accession = assembly_data["erz_accession"]

    # Step 4: Query assembly status
    report_response = mock_ena_client.get(
        f"/submit/report/analysis-process/{erz_accession}",
        auth=("test_user", "test_password")
    )

    assert report_response.status_code == 200
    assert "GCA_" in report_response.text
    assert "COMPLETED" in report_response.text

    print("\n=== Full Workflow Summary ===")
    print(f"Project accession: {project_accession}")
    print(f"Sample accession: {sample_accession}")
    print(f"Assembly (ERZ) accession: {erz_accession}")
    print(f"Assembly (GCA) accession: {assembly_data['gca_accession']}")
    print("=== Workflow completed successfully ===\n")


def test_error_handling_missing_files(mock_ena_client, auth):
    """Test error handling when required files are missing."""

    submission_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <SUBMISSION alias="error_test">
        <ACTIONS><ACTION><ADD/></ACTION></ACTIONS>
    </SUBMISSION>"""

    # Submit without PROJECT or SAMPLE
    response = mock_ena_client.post(
        "/submit/drop-box/submit",
        auth=("test_user", "test_password"),
        files={
            "SUBMISSION": ("submission.xml", submission_xml, "application/xml"),
        }
    )

    assert response.status_code == 400
    assert "RECEIPT" in response.text
    assert "success=\"false\"" in response.text


def test_accession_generator_consistency():
    """Test that accession generator produces consistent results."""
    gen1 = AccessionGenerator(seed=42)
    gen2 = AccessionGenerator(seed=42)

    # Should generate same accessions with same seed
    assert gen1.generate("PROJECT") == gen2.generate("PROJECT")
    assert gen1.generate("SAMPLE") == gen2.generate("SAMPLE")
    assert gen1.generate("BIOSAMPLE") == gen2.generate("BIOSAMPLE")
    assert gen1.generate("ASSEMBLY") == gen2.generate("ASSEMBLY")

    # Should follow correct format
    assert gen1.generate("PROJECT").startswith("PRJEB")
    assert gen1.generate("SAMPLE").startswith("ERS")
    assert gen1.generate("BIOSAMPLE").startswith("SAMEA")
    assert gen1.generate("ASSEMBLY").startswith("ERZ")
    assert gen1.generate("GCA").startswith("GCA_")
    assert gen1.generate("SUBMISSION").startswith("ERA-SUBMIT-")


def test_database_persistence():
    """Test that database correctly persists submissions."""
    import tempfile

    # Create temporary database file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as f:
        db_path = f.name

    try:
        # Create database and add entries
        db1 = MockENADatabase(db_path)
        from mock_ena.database import Project

        project = Project(
            alias="test_project",
            accession="PRJEB001000",
            submission_accession="ERA-SUBMIT-TEST",
            title="Test",
            description="Test project",
            taxon_id="2697049"
        )
        db1.create_project(project)

        # Close and reopen database
        db2 = MockENADatabase(db_path)
        retrieved_project = db2.get_project_by_alias("test_project")

        assert retrieved_project is not None
        assert retrieved_project.accession == "PRJEB001000"
        assert retrieved_project.title == "Test"

    finally:
        # Cleanup
        import os
        if os.path.exists(db_path):
            os.unlink(db_path)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
