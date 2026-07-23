import logging
import shlex
import subprocess  # ruff:ignore[suspicious-subprocess-import]
from pathlib import Path

logger = logging.getLogger(__name__)


class TransformationError(Exception):
    """Raised when data transformation fails"""


def transform_data_format(data_path, transformed_path):
    """
    See https://github.com/GenSpectrum/LAPIS-SILO/tree/main/tools/legacyNdjsonTransformer
    for details on input and output format.
    """
    data_path = Path(data_path)
    transformed_path = Path(transformed_path)

    cmd = (
        "set -o pipefail; "
        f"zstdcat {shlex.quote(str(data_path))} | legacy-ndjson-transformer | "
        f"zstd > {shlex.quote(str(transformed_path))}"
    )

    try:
        subprocess.run(  # ruff:ignore[subprocess-popen-with-shell-equals-true]
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
        raise TransformationError(msg) from e
