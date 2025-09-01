"""Tests for author format error reporting."""

# ruff: noqa: S101

import importlib.util
import sys
import types
from pathlib import Path

PACKAGE_NAME = "loculus_preprocessing"
PACKAGE_PATH = Path(__file__).resolve().parents[1] / "src" / PACKAGE_NAME
SRC_PATH = PACKAGE_PATH / "processing_functions.py"

package = types.ModuleType(PACKAGE_NAME)
package.__path__ = [str(PACKAGE_PATH)]
sys.modules[PACKAGE_NAME] = package

spec = importlib.util.spec_from_file_location(f"{PACKAGE_NAME}.processing_functions", SRC_PATH)
processing_functions = importlib.util.module_from_spec(spec)
sys.modules[f"{PACKAGE_NAME}.processing_functions"] = processing_functions
spec.loader.exec_module(processing_functions)
ProcessingFunctions = processing_functions.ProcessingFunctions


def test_check_authors_lists_invalid_names():
    authors = "Smith Anna; Jones Bob;"  # missing commas
    result = ProcessingFunctions.check_authors({"authors": authors}, "authors", ["authors"], {})
    assert result.errors
    msg = result.errors[0].message
    assert "Smith Anna" in msg and "Jones Bob" in msg
    assert "others" not in msg


def test_check_authors_lists_invalid_names_with_others():
    authors = ";".join(["A B"] * 5)
    result = ProcessingFunctions.check_authors({"authors": authors}, "authors", ["authors"], {})
    assert result.errors
    msg = result.errors[0].message
    assert "Invalid name(s): A B; A B; A B ... and 2 others" in msg
