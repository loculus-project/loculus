import logging
import threading

import uvicorn
from fastapi import FastAPI, HTTPException
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
from pydantic import BaseModel

from .config import Config
from .submission_db_helper import db_init

logger = logging.getLogger(__name__)

app = FastAPI(title="ENA Deposition Pod API", description="API for ENA Deposition Pod")


class SubmittedAccessionsResponse(BaseModel):
    status: str
    insdcAccessions: list[str]  # noqa: N815
    biosampleAccessions: list[str]  # noqa: N815


def get_bio_sample_accessions(db_conn_pool: SimpleConnectionPool) -> dict[str, str]:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT accession, result FROM sample_table WHERE STATUS = 'SUBMITTED'"
            cur.execute(query)
            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return {result["accession"]: result["result"]["biosample_accession"] for result in results}


def get_insdc_accessions(db_conn_pool: SimpleConnectionPool) -> dict[str, list[str]]:
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


def init_app(config: Config):
    app.state.config = config


@app.get("/")
def read_root():
    return {"message": "ENA Deposition Pod API is running"}


@app.get("/submitted", response_model=SubmittedAccessionsResponse)
def submitted_insdc_accessions():
    config = app.state.config
    db_conn_pool = db_init(config.db_password, config.db_username, config.db_url)
    try:
        insdc_accessions = get_insdc_accessions(db_conn_pool)
        all_insdc_accessions = [item for sublist in insdc_accessions.values() for item in sublist]
        bio_samples = list(get_bio_sample_accessions(db_conn_pool).values())
        return {
            "status": "ok",
            "insdcAccessions": all_insdc_accessions,
            "biosampleAccessions": bio_samples,
        }
    except Exception as e:
        logger.error(f"Failed to fetch submitted accessions: {e}")
        raise HTTPException(status_code=500, detail="Internal server error") from e


def start_api(config: Config, stop_event: threading.Event):
    init_app(config)
    host = config.ena_deposition_host or "127.0.0.1"
    port = config.ena_deposition_port or 5000
    logger.info("Starting ENA Deposition Pod API on port %d", port)

    uvicorn_config = uvicorn.Config(app, host=host, port=port, log_level="info", workers=1)
    server = uvicorn.Server(uvicorn_config)

    server_thread = threading.Thread(target=server.run)
    server_thread.start()

    stop_event.wait()
    logger.warning("API received stop event, shutting down API...")

    server.should_exit = True
    server_thread.join()
