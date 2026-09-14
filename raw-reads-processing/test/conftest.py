"""Shared helpers for the raw-reads-processing tests."""

import pytest

EXTERNAL_TOOL_FIXTURES = {"readtools_jar", "deacon_server"}
EXTERNAL_TOOL_MARKER = "needs_external_tools"


def pytest_collection_modifyitems(items):
    """Mark every test that drives a real external tool, so it can be deselected.

    Applied by fixture use rather than by hand so a new test cannot forget it.
    """
    for item in items:
        if EXTERNAL_TOOL_FIXTURES & set(getattr(item, "fixturenames", ())):
            item.add_marker(EXTERNAL_TOOL_MARKER)


def require_external_tool(what: str, how_to_get_it: str) -> None:
    """Fail, rather than skip, when a tool the tests exercise is unavailable.

    These are the only tests that run the real readtools/deacon binaries; the
    rest is pure Python. A silent skip therefore makes a green local run look
    like it covered them when it did not. The service image always has both, so
    this only fires locally, where `-m "not needs_external_tools"` is the
    deliberate way to leave them out.
    """
    pytest.fail(
        f"{what} not found. {how_to_get_it} "
        f'Alternatively run pytest -m "not {EXTERNAL_TOOL_MARKER}" to leave out '
        "the tests that need it."
    )
