import logging
import threading
from typing import cast

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from .config import Config
from .submission_db_helper import AssemblyTableEntry, SampleTableEntry, Status, db_init

logger = logging.getLogger(__name__)

app = FastAPI(title="ENA Deposition Pod API", description="API for ENA Deposition Pod")


class SubmittedAccessionsResponse(BaseModel):
    status: str
    insdcAccessions: list[str]  # noqa: N815
    biosampleAccessions: list[str]  # noqa: N815


def get_bio_sample_accessions(engine: Engine) -> dict[str, str]:
    with Session(engine) as session:
        stmt = select(SampleTableEntry).where(SampleTableEntry.status == Status.SUBMITTED)
        results = list(session.scalars(stmt).all())
    return {
        row.accession: cast(str, row.result["biosample_accession"]) for row in results if row.result
    }


def get_insdc_accessions(engine: Engine) -> dict[str, list[str]]:
    with Session(engine) as session:
        stmt = select(AssemblyTableEntry).where(
            AssemblyTableEntry.status.in_([Status.SUBMITTED, Status.WAITING])
        )
        results = list(session.scalars(stmt).all())
    return {
        row.accession: [
            cast(str, row.result[key])
            for key in row.result
            if key.startswith("insdc_accession_full")
        ]
        for row in results
        if row.result
    }


def init_app(config: Config):
    app.state.config = config
    app.state.engine = db_init(config.db_password, config.db_username, config.db_url)


@app.get("/")
def read_root():
    return {"message": "ENA Deposition Pod API is running"}


@app.get("/submitted", response_model=SubmittedAccessionsResponse)
def submitted_insdc_accessions():
    engine = app.state.engine
    try:
        insdc_accessions = get_insdc_accessions(engine)
        all_insdc_accessions = [item for sublist in insdc_accessions.values() for item in sublist]
        bio_samples = list(get_bio_sample_accessions(engine).values())
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
