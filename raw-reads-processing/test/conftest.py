from typing import NoReturn

import pytest


def pytest_addoption(parser):
    parser.addoption(
        "--skip-missing-deps",
        action="store_true",
        default=False,
        help="Skip tests that need external tools (deacon binary, readtools "
        "jar) instead of failing them when those tools aren't available.",
    )

def missing_dependency(request, message: str) -> NoReturn:
    if request.config.getoption("--skip-missing-deps"):
        pytest.skip(message)
    pytest.fail(message)
