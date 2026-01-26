"""FastAPI application for the ENA Deposition API."""

import logging
import threading
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
from pydantic import BaseModel

from ..config import Config
from ..submission_db_helper import db_init
from . import errors, submissions
from .schemas import HealthResponse

logger = logging.getLogger(__name__)

# Global database connection pool
_db_conn_pool: SimpleConnectionPool | None = None
_config: Config | None = None


def get_db_conn_pool() -> SimpleConnectionPool:
    """Get the database connection pool."""
    if _db_conn_pool is None:
        msg = "Database connection pool not initialized"
        raise RuntimeError(msg)
    return _db_conn_pool


def get_config() -> Config:
    """Get the application config."""
    if _config is None:
        msg = "Config not initialized"
        raise RuntimeError(msg)
    return _config


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    global _db_conn_pool
    config = get_config()
    _db_conn_pool = db_init(config.db_password, config.db_username, config.db_url)
    logger.info("Database connection pool initialized")
    yield
    if _db_conn_pool:
        _db_conn_pool.closeall()
        logger.info("Database connection pool closed")


app = FastAPI(
    title="ENA Deposition API",
    description="API for managing ENA sequence depositions",
    version="2.0.0",
    lifespan=lifespan,
)

# Add CORS middleware to allow requests from the website
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for now; can be restricted in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(submissions.router)
app.include_router(errors.router)


@app.get("/", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(
        status="ok",
        message="ENA Deposition API is running",
    )


@app.get("/api/health", response_model=HealthResponse)
def api_health_check() -> HealthResponse:
    """API health check endpoint."""
    return HealthResponse(
        status="ok",
        message="ENA Deposition API is running",
    )


# Legacy endpoint for backward compatibility
class SubmittedAccessionsResponse(BaseModel):
    """Response model for legacy /submitted endpoint."""

    status: str
    insdcAccessions: list[str]  # noqa: N815
    biosampleAccessions: list[str]  # noqa: N815


def _get_bio_sample_accessions(db_conn_pool: SimpleConnectionPool) -> dict[str, str]:
    """Get biosample accessions from submitted samples."""
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT accession, result FROM sample_table WHERE STATUS = 'SUBMITTED'"
            cur.execute(query)
            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return {result["accession"]: result["result"]["biosample_accession"] for result in results}


def _get_insdc_accessions(db_conn_pool: SimpleConnectionPool) -> dict[str, list[str]]:
    """Get INSDC accessions from submitted assemblies."""
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            query = (
                "SELECT accession, result FROM assembly_table "
                "WHERE STATUS IN ('SUBMITTED', 'WAITING')"
            )
            cur.execute(query)
            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return {
        result["accession"]: [
            result["result"][key]
            for key in result["result"]
            if key.startswith("insdc_accession_full")
        ]
        for result in results
    }


@app.get("/submitted", response_model=SubmittedAccessionsResponse)
def submitted_insdc_accessions() -> SubmittedAccessionsResponse:
    """Legacy endpoint: Get all submitted INSDC and BioSample accessions."""
    try:
        db_conn_pool = get_db_conn_pool()
        insdc_accessions = _get_insdc_accessions(db_conn_pool)
        all_insdc_accessions = [item for sublist in insdc_accessions.values() for item in sublist]
        bio_samples = list(_get_bio_sample_accessions(db_conn_pool).values())
        return SubmittedAccessionsResponse(
            status="ok",
            insdcAccessions=all_insdc_accessions,
            biosampleAccessions=bio_samples,
        )
    except Exception as e:
        logger.error(f"Failed to fetch submitted accessions: {e}")
        raise HTTPException(status_code=500, detail="Internal server error") from e


def init_app(config: Config) -> None:
    """Initialize the application with config."""
    global _config, _db_conn_pool
    _config = config
    _db_conn_pool = db_init(config.db_password, config.db_username, config.db_url)
    logger.info("Application initialized with config")


def start_api(config: Config, stop_event: threading.Event) -> None:
    """Start the API server.

    Args:
        config: Application configuration
        stop_event: Event to signal when to stop the server
    """
    global _config, _db_conn_pool
    _config = config
    _db_conn_pool = db_init(config.db_password, config.db_username, config.db_url)

    host = config.ena_deposition_host or "127.0.0.1"
    port = config.ena_deposition_port or 5000
    logger.info("Starting ENA Deposition API on %s:%d", host, port)

    uvicorn_config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="info",
        workers=1,
    )
    server = uvicorn.Server(uvicorn_config)

    server_thread = threading.Thread(target=server.run)
    server_thread.start()

    stop_event.wait()
    logger.warning("API received stop event, shutting down API...")

    server.should_exit = True
    server_thread.join()

    if _db_conn_pool:
        _db_conn_pool.closeall()
