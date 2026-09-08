import logging
import subprocess  # noqa: S404

from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure
import uvicorn
from fastapi import FastAPI, HTTPException
from raw_reads_processing.datatypes import RequestWithFiles, ValidationResult
from raw_reads_processing.process_files import validate_raw_reads_submission
from raw_reads_processing.readtools_server import readtools_server_healthy

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
    if app.state.deacon_process.poll() is not None:
        raise HTTPException(status_code=503, detail="Deacon server process has exited")
    if app.state.readtools_process is not None:
        if app.state.readtools_process.poll() is not None:
            raise HTTPException(
                status_code=503, detail="readtools validation server process has exited"
            )
        # A live JVM whose validation path is broken or fully wedged still fails this.
        if not readtools_server_healthy(app.state.config):
            raise HTTPException(
                status_code=503, detail="readtools validation server is not healthy"
            )
    return {"message": "Deacon server is running"}


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


def init_app(
    config: Config,
    deacon_process: subprocess.Popen,
    readtools_process: subprocess.Popen | None = None,
):
    app.state.config = config
    app.state.deacon_process = deacon_process
    app.state.readtools_process = readtools_process


def start_api(
    config: Config,
    deacon_process: subprocess.Popen,
    readtools_process: subprocess.Popen | None = None,
):
    init_app(config, deacon_process, readtools_process)
    host = config.file_service_host or "127.0.0.1"
    port = config.file_service_port or 5000
    logger.info(f"Starting raw reads processing service API on port {port}")

    uvicorn_config = uvicorn.Config(
        app, host=host, port=port, log_level="info", workers=1
    )
    server = uvicorn.Server(uvicorn_config)

    server.run()
