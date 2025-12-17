import subprocess  # noqa: S404
from pathlib import Path


def transform_data_format(data_path, transformed_path):
    data_path = Path(data_path)
    transformed_path = Path(transformed_path)

    cmd = (
        f"zstdcat {data_path} | "
        "legacy-ndjson-transformer | "
        f"zstd > {transformed_path}"
    )

    subprocess.run(  # noqa: S602
        cmd,
        shell=True,
        check=True,
        executable="/bin/bash",
    )
