# ruff: noqa: S101 (allow asserts in tests)

import pytest
from ena_deposition.config import Config

SECRET_FIELDS = [
    "password",
    "db_password",
    "ena_submission_password",
    "slack_hook",
    "slack_token",
]


@pytest.mark.parametrize("field_name", SECRET_FIELDS)
def test_secret_fields_are_excluded_from_repr(field_name: str) -> None:
    # Config is logged at startup, so secrets must not appear in its repr.
    assert Config.model_fields[field_name].repr is False
