"""Mock ENA server for testing ENA submission pipeline."""

import logging
import os
import secrets
import sqlite3
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

import xmltodict
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import PlainTextResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from starlette.datastructures import UploadFile

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Mock ENA Service", description="Mock ENA for testing")
security = HTTPBasic()

# Thread-safe accession counter
_counter_lock = threading.Lock()
_counters: dict[str, int] = {
    "project": 20000,
    "sample": 1800000,
    "biosample": 104000000,
    "submission": 900000,
    "assembly": 24800000,
    "genome": 900000000,
    "chromosome": 100000,
}

# SQLite database for state persistence (configurable via env var)
DB_PATH = Path(os.environ.get("MOCK_ENA_DB_PATH", "/tmp/mock-ena.db"))  # noqa: S108


def get_db():
    """Get SQLite database connection."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables."""
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            alias TEXT PRIMARY KEY,
            accession TEXT NOT NULL,
            submission_accession TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS samples (
            alias TEXT PRIMARY KEY,
            accession TEXT NOT NULL,
            biosample_accession TEXT NOT NULL,
            submission_accession TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS assemblies (
            erz_accession TEXT PRIMARY KEY,
            gca_accession TEXT,
            insdc_accessions TEXT,
            status TEXT NOT NULL DEFAULT 'PROCESSING',
            created_at TEXT NOT NULL
        );
    """)
    conn.commit()
    conn.close()


init_db()


def generate_accession(prefix: str, counter_key: str) -> str:
    """Generate a unique accession number."""
    with _counter_lock:
        _counters[counter_key] += 1
        num = _counters[counter_key]
    return f"{prefix}{num}"


def verify_credentials(
    credentials: Annotated[HTTPBasicCredentials, Depends(security)],
) -> str:
    """Verify basic auth credentials - accepts any non-empty credentials for testing."""
    if not credentials.username or not credentials.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


@app.get("/")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "mock-ena"}


@app.get("/ca.crt")
async def get_ca_cert():
    """Serve the CA certificate for clients that need to trust this server."""
    ca_cert_path = Path(__file__).parent / "certs" / "ca.crt"
    if ca_cert_path.exists():
        return PlainTextResponse(
            content=ca_cert_path.read_text(),
            media_type="application/x-pem-file",
        )
    raise HTTPException(status_code=404, detail="CA certificate not found")


@app.post("/ena/submit/drop-box/submit")
async def submit_xml(
    request: Request,
    username: Annotated[str, Depends(verify_credentials)],
):
    """
    Handle XML submission for projects and samples.
    Expects multipart form data with SUBMISSION and PROJECT or SAMPLE files.
    """
    form = await request.form()
    logger.info(f"Received submission from user: {username}")
    logger.info(f"Form fields: {list(form.keys())}")

    submission_xml = None
    project_xml = None
    sample_xml = None

    for key, value in form.items():
        logger.info(f"Processing field {key}, type: {type(value)}")
        # Handle both UploadFile and string values
        if isinstance(value, UploadFile):
            content = (await value.read()).decode("utf-8")
        elif isinstance(value, str):
            content = value
        else:
            content = str(value)

        logger.info(f"Received {key}: {content[:200]}...")

        if key.upper() == "SUBMISSION":
            submission_xml = content
        elif key.upper() == "PROJECT":
            project_xml = content
        elif key.upper() == "SAMPLE":
            sample_xml = content

    if not submission_xml:
        return create_error_receipt("Missing SUBMISSION file")

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"

    if project_xml:
        return handle_project_submission(project_xml, now)
    if sample_xml:
        return handle_sample_submission(sample_xml, now)
    return create_error_receipt("Missing PROJECT or SAMPLE file")


def handle_project_submission(project_xml: str, timestamp: str) -> Response:
    """Handle project submission and return receipt."""
    try:
        parsed = xmltodict.parse(project_xml)
        project_set = parsed.get("PROJECT_SET", {})
        project = project_set.get("PROJECT", {})

        alias = project.get("@alias", "unknown")
        logger.info(f"Processing project with alias: {alias}")

        # Check for duplicate
        conn = get_db()
        existing = conn.execute(
            "SELECT accession FROM projects WHERE alias = ?", (alias,)
        ).fetchone()

        if existing:
            conn.close()
            return create_error_receipt(f"Project with alias '{alias}' already exists")

        # Generate accessions
        project_accession = generate_accession("PRJEB", "project")
        submission_accession = generate_accession("ERA", "submission")

        # Store in database
        conn.execute(
            """INSERT INTO projects (alias, accession, submission_accession, created_at)
               VALUES (?, ?, ?, ?)""",
            (alias, project_accession, submission_accession, timestamp),
        )
        conn.commit()
        conn.close()

        receipt = f"""<?xml version="1.0" encoding="UTF-8"?>
<RECEIPT receiptDate="{timestamp}" submissionFile="submission.xml" success="true">
    <PROJECT accession="{project_accession}" alias="{alias}" status="PRIVATE"/>
    <SUBMISSION accession="{submission_accession}" alias="{alias}_submission"/>
    <MESSAGES>
        <INFO>This submission is a TEST submission and will be discarded within 24 hours</INFO>
    </MESSAGES>
    <ACTIONS>ADD</ACTIONS>
</RECEIPT>"""

        logger.info(f"Project submitted successfully: {project_accession}")
        return Response(content=receipt, media_type="application/xml")

    except Exception as e:
        logger.exception("Error processing project submission")
        return create_error_receipt(str(e))


def handle_sample_submission(sample_xml: str, timestamp: str) -> Response:
    """Handle sample submission and return receipt."""
    try:
        parsed = xmltodict.parse(sample_xml)
        sample_set = parsed.get("SAMPLE_SET", {})
        sample = sample_set.get("SAMPLE", {})

        alias = sample.get("@alias", "unknown")
        logger.info(f"Processing sample with alias: {alias}")

        # Check for duplicate
        conn = get_db()
        existing = conn.execute(
            "SELECT accession FROM samples WHERE alias = ?", (alias,)
        ).fetchone()

        if existing:
            conn.close()
            return create_error_receipt(f"Sample with alias '{alias}' already exists")

        # Generate accessions
        sample_accession = generate_accession("ERS", "sample")
        biosample_accession = generate_accession("SAMEA", "biosample")
        submission_accession = generate_accession("ERA", "submission")

        # Store in database
        conn.execute(
            """INSERT INTO samples
               (alias, accession, biosample_accession, submission_accession, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (alias, sample_accession, biosample_accession, submission_accession, timestamp),
        )
        conn.commit()
        conn.close()

        receipt = f"""<?xml version="1.0" encoding="UTF-8"?>
<RECEIPT receiptDate="{timestamp}" submissionFile="submission.xml" success="true">
    <SAMPLE accession="{sample_accession}" alias="{alias}" status="PRIVATE">
        <EXT_ID accession="{biosample_accession}" type="biosample"/>
    </SAMPLE>
    <SUBMISSION accession="{submission_accession}" alias="{alias}_submission"/>
    <MESSAGES>
        <INFO>This submission is a TEST submission and will be discarded within 24 hours</INFO>
    </MESSAGES>
    <ACTIONS>ADD</ACTIONS>
</RECEIPT>"""

        logger.info(f"Sample submitted successfully: {sample_accession}")
        return Response(content=receipt, media_type="application/xml")

    except Exception as e:
        logger.exception("Error processing sample submission")
        return create_error_receipt(str(e))


def create_error_receipt(error_message: str) -> Response:
    """Create an error receipt XML response."""
    timestamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"
    receipt = f"""<?xml version="1.0" encoding="UTF-8"?>
<RECEIPT receiptDate="{timestamp}" success="false">
    <MESSAGES>
        <ERROR>{error_message}</ERROR>
    </MESSAGES>
</RECEIPT>"""
    return Response(content=receipt, media_type="application/xml")


@app.post("/ena/submit/webin/auth/token")
async def auth_token(
    _username: Annotated[str, Depends(verify_credentials)],
):
    """Authentication endpoint - returns a mock JWT token."""
    # Return a mock token
    token = secrets.token_urlsafe(32)
    return PlainTextResponse(content=token)


@app.get("/ena/submit/drop-box/cli/{version}")
async def cli_version_check(version: str):
    """Version check endpoint for webin-cli."""
    # Return empty 200 to indicate the version is acceptable
    return {"version": version, "status": "ok"}


@app.post("/ena/submit/webin-v2/submit")
async def webin_v2_submit(
    request: Request,
    username: Annotated[str, Depends(verify_credentials)],
):
    """
    Handle Webin V2 assembly submission.
    This is called by the webin-cli for genome submissions.
    """
    # Read the request body
    body = await request.body()
    logger.info(f"Received webin-v2 submission from user: {username}")
    logger.info(f"Body preview: {body[:500] if body else 'empty'}...")

    timestamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"

    # Generate ERZ accession for assembly
    erz_accession = generate_accession("ERZ", "assembly")

    # Store in database with PROCESSING status
    conn = get_db()
    conn.execute(
        "INSERT INTO assemblies (erz_accession, status, created_at) VALUES (?, 'COMPLETED', ?)",
        (erz_accession, timestamp),
    )

    # Also generate GCA and INSDC accessions immediately for testing
    gca_accession = generate_accession("GCA_", "genome") + ".1"
    insdc_accession = f"OZ{_counters['chromosome']:06d}"
    _counters["chromosome"] += 1

    conn.execute(
        "UPDATE assemblies SET gca_accession = ?, insdc_accessions = ? WHERE erz_accession = ?",
        (gca_accession, insdc_accession, erz_accession),
    )
    conn.commit()
    conn.close()

    logger.info(f"Assembly submitted successfully: {erz_accession}")

    # Return success response matching webin-cli expected format
    return {
        "accession": erz_accession,
        "status": "COMPLETED",
        "message": f"The following analysis accession was assigned to the "
        f"submission: {erz_accession}",
    }


@app.get("/ena/submit/report/analysis-process/{erz_accession}")
async def get_analysis_process(
    erz_accession: str,
    _username: Annotated[str, Depends(verify_credentials)],
):
    """
    Get assembly processing status.
    Returns the status and accessions for a submitted assembly.
    """
    conn = get_db()
    assembly = conn.execute(
        "SELECT * FROM assemblies WHERE erz_accession = ?", (erz_accession,)
    ).fetchone()
    conn.close()

    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")

    # Build the acc string in ENA format
    acc_parts = []
    if assembly["gca_accession"]:
        acc_parts.append(f"genome:{assembly['gca_accession']}")
    if assembly["insdc_accessions"]:
        acc_parts.append(f"chromosomes:{assembly['insdc_accessions']}")
    acc_string = ",".join(acc_parts) if acc_parts else None

    return [
        {
            "report": {
                "id": erz_accession,
                "analysisType": "SEQUENCE_ASSEMBLY",
                "acc": acc_string,
                "processingStatus": assembly["status"],
                "processingStart": assembly["created_at"],
                "processingEnd": (
                    assembly["created_at"] if assembly["status"] == "COMPLETED" else None
                ),
                "processingError": None,
            }
        }
    ]


# Admin endpoints for testing
@app.get("/admin/state")
async def get_state():
    """Get all submitted items for debugging."""
    conn = get_db()
    projects = [dict(row) for row in conn.execute("SELECT * FROM projects").fetchall()]
    samples = [dict(row) for row in conn.execute("SELECT * FROM samples").fetchall()]
    assemblies = [dict(row) for row in conn.execute("SELECT * FROM assemblies").fetchall()]
    conn.close()

    return {
        "projects": projects,
        "samples": samples,
        "assemblies": assemblies,
    }


@app.post("/admin/reset")
async def reset_state():
    """Clear all state for testing."""
    conn = get_db()
    conn.execute("DELETE FROM projects")
    conn.execute("DELETE FROM samples")
    conn.execute("DELETE FROM assemblies")
    conn.commit()
    conn.close()

    # Reset counters
    with _counter_lock:
        _counters.update({
            "project": 20000,
            "sample": 1800000,
            "biosample": 104000000,
            "submission": 900000,
            "assembly": 24800000,
            "genome": 900000000,
            "chromosome": 100000,
        })

    logger.info("State reset")
    return {"status": "ok", "message": "State cleared"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8090)  # noqa: S104
