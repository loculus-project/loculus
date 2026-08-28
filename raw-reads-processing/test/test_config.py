# ruff: noqa: S101

from raw_reads_processing.config import get_config


def test_defaults_yaml_alone_satisfies_every_required_config_field(tmp_path):
    # Nothing else exercises get_config, so a key missing from defaults.yaml would
    # otherwise only show up as a pydantic ValidationError at pod startup.
    empty = tmp_path / "config.yaml"
    empty.write_text("{}\n")

    config = get_config(empty)

    assert config.max_input_file_bytes > 0
    assert config.deacon_threads > 0
    assert config.deacon_max_concurrent_filters > 0
