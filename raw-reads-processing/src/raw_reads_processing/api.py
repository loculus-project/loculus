import logging

import uvicorn
from fastapi import FastAPI, HTTPException
from raw_reads_processing.datatypes import RequestWithFiles, ValidationResult
from raw_reads_processing.deacon import DeaconFilter
from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure
from raw_reads_processing.process_files import validate_raw_reads_submission

from .config import Config

logger = logging.getLogger()

app = FastAPI(
    title="Raw Reads Processing Service", description="Loculus raw reads processing API"
)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Raw Reads Processing Service is running"}


@app.get("/health")
def health() -> dict[str, str]:
    # The index lives in this process, so "we are serving and the index is loaded" is
    # the whole health condition; there is no separate daemon that can die or wedge
    # underneath us while the process stays up.
    if getattr(app.state, "deacon_filter", None) is None:
        raise HTTPException(status_code=503, detail="Deacon index is not loaded")
    return {"message": "Deacon index is loaded"}


@app.post("/process-files")
def process_files(
    payload: RequestWithFiles,
) -> ValidationResult:
    try:
        validate_raw_reads_submission(
            config=app.state.config,
            deacon_filter=app.state.deacon_filter,
            request_with_files=payload,
        )
    except InvalidSubmission as e:
        return ValidationResult(errors=[e.error])
    except ProcessingFailure as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return ValidationResult()


def init_app(config: Config, deacon_filter: DeaconFilter):
    app.state.config = config
    app.state.deacon_filter = deacon_filter


def start_api(config: Config, deacon_filter: DeaconFilter):
    init_app(config, deacon_filter)
    host = config.file_service_host or "127.0.0.1"
    port = config.file_service_port or 5000
    logger.info(f"Starting raw reads processing service API on port {port}")

    # workers=1 is load-bearing, not incidental: the deacon index is ~4.5GB on this
    # process's heap and is shared between requests by threads, not by processes.
    # A second worker would load a second copy and exceed the pod's memory limit.
    uvicorn_config = uvicorn.Config(
        app, host=host, port=port, log_level="info", workers=1
    )
    server = uvicorn.Server(uvicorn_config)

    server.run()
