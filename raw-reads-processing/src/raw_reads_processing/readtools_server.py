"""Client and lifecycle for the readtools warm validation server.

A cold `java -jar readtools.jar` spends roughly half its wall time on classloading and JIT
warm-up that the process then throws away. Keeping one JVM warm alongside the deacon server
removes that, and lets several validations run concurrently in it instead of forking a JVM per
submission -- which matters because the deacon index leaves little memory headroom for N JVMs.

The server returns the exact stdout/stderr the CLI would have printed, so the validation error
messages users see are produced by the same code either way.
"""

import logging
import os
import subprocess  # noqa: S404
import time

import requests

from raw_reads_processing.config import Config
from raw_reads_processing.errors import ProcessingFailure

logger = logging.getLogger(__name__)

VALIDATION_JAR_PATH = os.environ.get("READTOOLS_JAR", "/opt/app/lib/readtools.jar")


def server_url(config: Config) -> str:
    return f"http://127.0.0.1:{config.readtools_server_port}"


def start_readtools_server(config: Config) -> subprocess.Popen:
    """Start the JVM. It is not ready to serve until `wait_until_ready` returns."""
    args = [
        "java",
        f"-Xmx{config.readtools_server_max_heap}",
        "-jar",
        VALIDATION_JAR_PATH,
        "server",
        # Loopback only: the server does no authentication and validates arbitrary local paths.
        "--host",
        "127.0.0.1",
        "--port",
        str(config.readtools_server_port),
        "--threads",
        str(config.readtools_server_threads),
    ]
    logger.info(f"Starting readtools validation server: {' '.join(args)}")

    return subprocess.Popen(args)  # noqa: S603


def wait_until_ready(config: Config, proc: subprocess.Popen) -> None:
    """Block until the server reports healthy, i.e. has finished its JIT warm-up.

    Returning early would hand the first real submission the cold-start cost this server exists
    to remove.
    """
    deadline = time.monotonic() + config.readtools_server_startup_timeout_seconds
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise ProcessingFailure(
                f"readtools validation server exited with code {proc.returncode} during startup"
            )
        if readtools_server_healthy(config):
            logger.info("readtools validation server is ready")
            return
        time.sleep(1)

    raise ProcessingFailure(
        "readtools validation server did not become ready within "
        f"{config.readtools_server_startup_timeout_seconds} seconds"
    )


def readtools_server_healthy(config: Config) -> bool:
    """True if the server answers a health probe, which runs a real one-read validation."""
    try:
        response = requests.get(f"{server_url(config)}/health", timeout=10)
    except requests.RequestException:
        return False
    return response.status_code == 200


def stop_readtools_server(proc: subprocess.Popen) -> None:
    logger.debug("Stopping readtools validation server")
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        logger.warning(
            "Failed to stop readtools validation server gracefully, sending SIGKILL"
        )
        proc.kill()
        proc.wait()


def run_validation(
    config: Config,
    files: list[str],
    file_format: str,
    timeout_seconds: int,
) -> tuple[int, str, str]:
    """Run one validation on the warm server.

    Returns the same (exit code, stdout, stderr) triple the CLI would have produced, so callers
    can parse it exactly as they parse a subprocess result.
    """
    try:
        response = requests.post(
            f"{server_url(config)}/validate",
            json={"files": files, "format": file_format},
            timeout=timeout_seconds,
        )
    except requests.Timeout:
        raise TimeoutError from None
    except requests.RequestException as e:
        message = f"Could not reach the readtools validation server: {e}"
        logger.error(message)
        raise ProcessingFailure(message) from e

    if response.status_code != 200:  # noqa: PLR2004
        message = (
            f"readtools validation server returned {response.status_code}: "
            f"{response.text[:200]}"
        )
        logger.error(message)
        raise ProcessingFailure(message)

    body = response.json()
    return body["exitCode"], body.get("stdout", ""), body.get("stderr", "")
