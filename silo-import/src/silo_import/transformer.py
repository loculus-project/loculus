import subprocess
from pathlib import Path


def transform_data_format(data_path, transformed_path):

    data_path = Path(data_path)
    transformed_path = Path(transformed_path)

    cmd = (
        f"zstdcat {data_path} | "
        f"../legacyNdjsonTransformer/target/release/legacy-ndjson-transformer | "
        f"zstd > {transformed_path}"
    )

    subprocess.run(
        cmd,
        shell=True,
        check=True,
        executable="/bin/bash",
    )
