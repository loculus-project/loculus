import logging

import uvicorn
from fastapi import FastAPI, Response
from file_processing.datatypes import Files
from file_processing.functions import process_submitted_files

from .config import Config

logger = logging.getLogger()

app = FastAPI(
    title="File Processing Service", description="Loculus file processing API"
)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "File Processing Service is running"}


@app.post("/process-files")
def post_process_files(
    payload: Files,
) -> Response:
    
    response_with_files = process_submitted_files(
        config=app.state.config,
        file_mapping=payload,
    )

    return Response(content=response_with_files, media_type="application/json")


def init_app(config: Config):
    app.state.config = config


def start_api(config: Config):
    init_app(config)
    host = config.file_service_host or "127.0.0.1"
    port = config.file_service_port or 5000
    logger.info(f"Starting file processing service API on port {port}")

    uvicorn_config = uvicorn.Config(
        app, host=host, port=port, log_level="info", workers=1
    )
    server = uvicorn.Server(uvicorn_config)

    server.run()
