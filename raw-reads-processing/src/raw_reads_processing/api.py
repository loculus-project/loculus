import logging

from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure
import uvicorn
from fastapi import FastAPI, HTTPException
from raw_reads_processing.datatypes import RequestWithFiles, ValidationResult
from raw_reads_processing.process_files import validate_raw_reads_submission

from .config import Config

logger = logging.getLogger()

app = FastAPI(
    title="Raw Reads Processing Service", description="Loculus raw reads processing API"
)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Raw Reads Processing Service is running"}


@app.post("/process-files")
def process_files(
    payload: RequestWithFiles,
) -> ValidationResult:
    try:
        validate_raw_reads_submission(
            config=app.state.config,
            request_with_files=payload,
        )
    except InvalidSubmission as e:
        return ValidationResult(errors=[e.error])
    except ProcessingFailure as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return ValidationResult()


def init_app(config: Config):
    app.state.config = config


def start_api(config: Config):
    init_app(config)
    host = config.file_service_host or "127.0.0.1"
    port = config.file_service_port or 5000
    logger.info(f"Starting raw reads processing service API on port {port}")

    uvicorn_config = uvicorn.Config(
        app, host=host, port=port, log_level="info", workers=1
    )
    server = uvicorn.Server(uvicorn_config)

    server.run()
