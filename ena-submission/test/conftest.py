import logging

import pytest

_test_context = {"name": "no-test"}

_original_log_record_factory = logging.getLogRecordFactory()


def _log_record_factory_with_test_name(*args: object, **kwargs: object) -> logging.LogRecord:
    record = _original_log_record_factory(*args, **kwargs)
    record.test_name = _test_context["name"]
    return record


logging.setLogRecordFactory(_log_record_factory_with_test_name)


@pytest.fixture(autouse=True)
def _tag_logs_with_test_name(request: pytest.FixtureRequest):
    _test_context["name"] = request.node.name
    yield
    _test_context["name"] = "no-test"
