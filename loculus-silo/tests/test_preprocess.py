from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
import yaml
from silo_import.preprocess import preprocess


@pytest.mark.parametrize(
    ("lineage_config", "lineage_definitions"),
    [
        ({}, []),
        ({"lineageDefinitionFilenames": ["lineage.yaml"]}, [Path("/input/lineage.yaml")]),
    ],
)
def test_preprocess_maps_config_to_rhydb_arguments(
    tmp_path: Path, lineage_config: dict[str, list[str]], lineage_definitions: list[Path]
) -> None:
    config = {
        "inputDirectory": "/input",
        "outputDirectory": "/output",
        "ndjsonInputFilename": "data.ndjson.zst",
        "referenceGenomeFilename": "reference_genomes.json",
    }
    preprocessing_config = tmp_path / "preprocessing_config.yaml"
    preprocessing_config.write_text(yaml.safe_dump(config | lineage_config))

    with patch("silo_import.preprocess.Database") as database:
        preprocess(preprocessing_config)

    database.return_value.preprocess.assert_called_once_with(
        database_config=Path("/input/database_config.yaml"),
        reference_genomes=Path("/input/reference_genomes.json"),
        input_file=Path("/input/data.ndjson.zst"),
        lineage_definitions=lineage_definitions,
    )
    database.return_value.save_checkpoint.assert_called_once_with("/output")
