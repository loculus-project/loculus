import logging
import shlex
import subprocess  # noqa: S404
from pathlib import Path

logger = logging.getLogger(__name__)


def transform_data_format(data_path, transformed_path):
    data_path = Path(data_path)
    transformed_path = Path(transformed_path)

    cmd = (
        "set -o pipefail; "
        f"zstdcat {shlex.quote(str(data_path))} | legacy-ndjson-transformer | "
        f"zstd > {shlex.quote(str(transformed_path))}"
    )

    try:
        subprocess.run(  # noqa: S602
            cmd,
            shell=True,
            check=True,
            executable="/bin/bash",
            stderr=subprocess.PIPE,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        msg = f"Subprocess failed: {e.stderr}"
        logger.error(msg)
        raise BaseException(msg) from e
