# ruff: noqa: S101

import json
import os
from pathlib import Path

import pytest

from raw_reads_processing import file_format_validation
from raw_reads_processing.datatypes import Annotation
from raw_reads_processing.errors import ProcessingFailure


def assert_storable(payload: str) -> None:
    stack = [json.loads(payload)]
    while stack:
        node = stack.pop()
        match node:
            case str():
                assert "\x00" not in node, repr(node)
                assert not any("\ud800" <= c <= "\udfff" for c in node), repr(node)
            case dict():
                stack.extend(node.keys())
                stack.extend(node.values())
            case list():
                stack.extend(node)


@pytest.fixture(autouse=True)
def _every_error_stays_storable(monkeypatch):
    annotation_init = Annotation.__init__
    failure_init = ProcessingFailure.__init__

    def checked_annotation(self, **kwargs):
        annotation_init(self, **kwargs)
        assert_storable(self.model_dump_json())

    def checked_failure(self, message):
        failure_init(self, message)
        assert_storable(json.dumps(str(self)))

    monkeypatch.setattr(Annotation, "__init__", checked_annotation)
    monkeypatch.setattr(ProcessingFailure, "__init__", checked_failure)


def _find_jar() -> str | None:
    service_dir = Path(__file__).parent.parent
    candidates = (
        os.environ.get("READTOOLS_JAR"),
        service_dir / "readtools.jar",
        file_format_validation.VALIDATION_JAR_PATH,
    )
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(candidate)
    return None

@pytest.fixture
def readtools_jar(request, monkeypatch):
    jar_path = _find_jar()
    if jar_path is None:
        message = (
            "readtools jar not found; set READTOOLS_JAR to its path to run this test"
        )
        if request.config.getoption("--skip-missing-deps"):
            pytest.skip(message)
        pytest.fail(message)
    monkeypatch.setattr(file_format_validation, "VALIDATION_JAR_PATH", jar_path)

def pytest_addoption(parser):
    parser.addoption(
        "--skip-missing-deps",
        action="store_true",
        default=False,
        help="Skip tests that need external tools (deacon binary, readtools "
        "jar) instead of failing them when those tools aren't available.",
    )
