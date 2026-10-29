import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).parents[1] / "scripts"


def load_script(name: str):
    # Scripts import each other by bare module name, so they must be importable.
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / f"{name}.py")
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_loculus_client_config_repr_hides_secrets() -> None:
    module = load_script("loculus_client")
    config = module.Config(
        organism="o",
        backend_url="http://backend",
        keycloak_token_url="http://keycloak/token",
        keycloak_client_id="c",
        username="user",
        password="s3cret-password",  # noqa: S106
        group_name="g",
        nucleotide_sequences=["main"],
        segmented=False,
        batch_chunk_size=1,
        slack_hook="https://hooks.slack.test/s3cret-hook",
    )

    assert "s3cret-password" not in repr(config)
    assert "s3cret-hook" not in repr(config)


def test_filter_out_depositions_config_repr_hides_db_password() -> None:
    module = load_script("filter_out_depositions")
    config = module.Config(
        segmented=False,
        db_password="s3cret-db",  # noqa: S106
        db_username="u",
        db_host="h",
    )

    assert "s3cret-db" not in repr(config)


@pytest.mark.parametrize("name", ["prepare_files", "override_group_segments"])
def test_slack_hook_hidden_from_repr(name: str) -> None:
    module = load_script(name)
    field = module.Config.__dataclass_fields__["slack_hook"]

    assert field.repr is False
