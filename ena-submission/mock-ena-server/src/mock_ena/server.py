"""FastAPI server for mock ENA."""

import logging
import secrets
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .accessions import AccessionGenerator
from .database import Assembly, MockENADatabase, Project, Sample, Submission
from .xml_utils import (
    generate_assembly_report_xml,
    generate_error_receipt_xml,
    generate_project_receipt_xml,
    generate_sample_receipt_xml,
    parse_project_xml,
    parse_sample_xml,
    parse_submission_xml,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Mock ENA Server",
    description="Simplified mock ENA server for testing ENA deposition code",
    version="0.1.0"
)

# HTTP Basic Auth
security = HTTPBasic()

# Global state (in production, use dependency injection)
db: Optional[MockENADatabase] = None
accession_gen: Optional[AccessionGenerator] = None

# Configuration
MOCK_USERNAME = "test_user"
MOCK_PASSWORD = "test_password"
DB_PATH = "/tmp/mock_ena.db"


def get_database() -> MockENADatabase:
    """Get database instance."""
    global db
    if db is None:
        db = MockENADatabase(DB_PATH)
    return db


def get_accession_generator() -> AccessionGenerator:
    """Get accession generator instance."""
    global accession_gen
    if accession_gen is None:
        accession_gen = AccessionGenerator()
    return accession_gen


def verify_credentials(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    """Verify HTTP Basic Auth credentials.

    Args:
        credentials: HTTP Basic Auth credentials

    Returns:
        Username if valid

    Raises:
        HTTPException: If credentials are invalid
    """
    is_username_correct = secrets.compare_digest(
        credentials.username.encode("utf8"), MOCK_USERNAME.encode("utf8")
    )
    is_password_correct = secrets.compare_digest(
        credentials.password.encode("utf8"), MOCK_PASSWORD.encode("utf8")
    )

    if not (is_username_correct and is_password_correct):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )

    return credentials.username


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Mock ENA Server",
        "version": "0.1.0",
        "endpoints": {
            "submit": "/submit/drop-box/submit",
            "report": "/submit/report/analysis-process/{erz_accession}"
        }
    }


@app.post("/submit/drop-box/submit")
async def submit(
    username: Annotated[str, Depends(verify_credentials)],
    SUBMISSION: UploadFile = File(...),
    PROJECT: Optional[UploadFile] = File(None),
    SAMPLE: Optional[UploadFile] = File(None),
    db: MockENADatabase = Depends(get_database),
    accession_gen: AccessionGenerator = Depends(get_accession_generator),
):
    """Handle ENA submission endpoint.

    This endpoint mimics the ENA submission API:
    - Accepts multipart/form-data with XML files
    - Returns XML RECEIPT response

    Args:
        username: Authenticated username
        SUBMISSION: Submission XML file (required)
        PROJECT: Project XML file (optional)
        SAMPLE: Sample XML file (optional)
        db: Database instance
        accession_gen: Accession generator instance

    Returns:
        XML RECEIPT response
    """
    try:
        logger.info(f"Received submission from user: {username}")

        # Parse SUBMISSION file
        submission_content = await SUBMISSION.read()
        submission_data = parse_submission_xml(submission_content.decode("utf-8"))
        logger.info(f"Submission alias: {submission_data['alias']}")

        # Generate submission accession
        submission_accession = accession_gen.generate("SUBMISSION")

        # Handle PROJECT submission
        if PROJECT:
            logger.info("Processing PROJECT submission")
            project_content = await PROJECT.read()
            project_data = parse_project_xml(project_content.decode("utf-8"))

            # Generate accessions
            project_accession = accession_gen.generate("PROJECT")

            # Store in database
            project = Project(
                alias=project_data["alias"],
                accession=project_accession,
                submission_accession=submission_accession,
                title=project_data["title"],
                description=project_data["description"],
                taxon_id=project_data["taxon_id"],
            )
            db.create_project(project)

            # Create submission record
            submission_record = Submission(
                alias=submission_data["alias"],
                accession=submission_accession,
                submission_type="PROJECT",
                status="SUCCESS"
            )
            db.create_submission(submission_record)

            # Generate receipt XML
            receipt_xml = generate_project_receipt_xml(
                project_accession=project_accession,
                project_alias=project_data["alias"],
                submission_accession=submission_accession,
                submission_alias=submission_data["alias"],
            )

            logger.info(f"Created project: {project_accession}")
            return Response(content=receipt_xml, media_type="application/xml")

        # Handle SAMPLE submission
        elif SAMPLE:
            logger.info("Processing SAMPLE submission")
            sample_content = await SAMPLE.read()
            sample_data = parse_sample_xml(sample_content.decode("utf-8"))

            # Generate accessions
            sample_accession = accession_gen.generate("SAMPLE")
            biosample_accession = accession_gen.generate("BIOSAMPLE")

            # Store in database
            sample = Sample(
                alias=sample_data["alias"],
                accession=sample_accession,
                biosample_accession=biosample_accession,
                submission_accession=submission_accession,
                taxon_id=sample_data["taxon_id"],
                scientific_name=sample_data["scientific_name"],
            )
            db.create_sample(sample)

            # Create submission record
            submission_record = Submission(
                alias=submission_data["alias"],
                accession=submission_accession,
                submission_type="SAMPLE",
                status="SUCCESS"
            )
            db.create_submission(submission_record)

            # Generate receipt XML
            receipt_xml = generate_sample_receipt_xml(
                sample_accession=sample_accession,
                biosample_accession=biosample_accession,
                sample_alias=sample_data["alias"],
                submission_accession=submission_accession,
                submission_alias=submission_data["alias"],
            )

            logger.info(f"Created sample: {sample_accession} / {biosample_accession}")
            return Response(content=receipt_xml, media_type="application/xml")

        else:
            # No PROJECT or SAMPLE provided
            error_msg = "Either PROJECT or SAMPLE must be provided"
            logger.error(error_msg)
            receipt_xml = generate_error_receipt_xml(error_msg)
            return Response(
                content=receipt_xml,
                media_type="application/xml",
                status_code=status.HTTP_400_BAD_REQUEST
            )

    except Exception as e:
        logger.exception("Error processing submission")
        error_xml = generate_error_receipt_xml(f"Server error: {str(e)}")
        return Response(
            content=error_xml,
            media_type="application/xml",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.post("/ena/submit/drop-box/submit")
async def submit_alt(
    username: Annotated[str, Depends(verify_credentials)],
    SUBMISSION: UploadFile = File(...),
    PROJECT: Optional[UploadFile] = File(None),
    SAMPLE: Optional[UploadFile] = File(None),
    db: MockENADatabase = Depends(get_database),
    accession_gen: AccessionGenerator = Depends(get_accession_generator),
):
    """Alternative endpoint path for compatibility."""
    return await submit(username, SUBMISSION, PROJECT, SAMPLE, db, accession_gen)


@app.get("/submit/report/analysis-process/{erz_accession}")
async def get_assembly_report(
    erz_accession: str,
    username: Annotated[str, Depends(verify_credentials)],
    db: MockENADatabase = Depends(get_database),
):
    """Get assembly processing report.

    This endpoint mimics the ENA assembly report API.

    Args:
        erz_accession: ERZ accession to query
        username: Authenticated username
        db: Database instance

    Returns:
        XML report with assembly status and GCA accession
    """
    logger.info(f"Assembly report requested for: {erz_accession}")

    assembly = db.get_assembly_by_accession(erz_accession)
    if not assembly:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assembly not found: {erz_accession}"
        )

    report_xml = generate_assembly_report_xml(
        erz_accession=erz_accession,
        gca_accession=assembly.gca_accession,
        status=assembly.status
    )

    return Response(content=report_xml, media_type="application/xml")


@app.post("/assemblies/mock/create")
async def mock_create_assembly(
    alias: str,
    study_accession: str,
    sample_accession: str,
    username: Annotated[str, Depends(verify_credentials)],
    db: MockENADatabase = Depends(get_database),
    accession_gen: AccessionGenerator = Depends(get_accession_generator),
):
    """Mock endpoint to simulate assembly creation.

    This is a helper endpoint not present in real ENA - used for testing.
    In real ENA, assemblies are created via Webin CLI, not HTTP.

    Args:
        alias: Assembly alias
        study_accession: Project accession
        sample_accession: Sample accession
        username: Authenticated username
        db: Database instance
        accession_gen: Accession generator instance

    Returns:
        JSON with created assembly accessions
    """
    logger.info(f"Mock assembly creation requested: {alias}")

    # Generate accessions
    erz_accession = accession_gen.generate("ASSEMBLY")
    gca_accession = accession_gen.generate("GCA")
    submission_accession = accession_gen.generate("SUBMISSION")

    # Store in database
    assembly = Assembly(
        alias=alias,
        accession=erz_accession,
        gca_accession=gca_accession,
        submission_accession=submission_accession,
        study_accession=study_accession,
        sample_accession=sample_accession,
        status="COMPLETED"  # Mock as already completed
    )
    db.create_assembly(assembly)

    logger.info(f"Created assembly: {erz_accession} -> {gca_accession}")

    return {
        "erz_accession": erz_accession,
        "gca_accession": gca_accession,
        "submission_accession": submission_accession,
        "status": "COMPLETED"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


def configure_server(
    database_path: str = ":memory:",
    username: str = "test_user",
    password: str = "test_password"
):
    """Configure the mock ENA server.

    Args:
        database_path: Path to SQLite database
        username: HTTP Basic Auth username
        password: HTTP Basic Auth password
    """
    global db, MOCK_USERNAME, MOCK_PASSWORD, DB_PATH

    DB_PATH = database_path
    MOCK_USERNAME = username
    MOCK_PASSWORD = password

    # Initialize database
    db = MockENADatabase(database_path)

    logger.info(f"Mock ENA server configured with database: {database_path}")


if __name__ == "__main__":
    import uvicorn

    configure_server()
    uvicorn.run(app, host="0.0.0.0", port=8080)
