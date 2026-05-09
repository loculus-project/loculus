from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "merge_group_overrides.py"
SPEC = importlib.util.spec_from_file_location("merge_group_overrides", SCRIPT_PATH)
merge_group_overrides_module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(merge_group_overrides_module)


def write_groups(path: Path, groups: dict[str, list[str]]) -> str:
    path.write_text(json.dumps(groups), encoding="utf-8")
    return str(path)


def test_merge_group_overrides_combines_disjoint_groups(tmp_path):
    first = write_groups(tmp_path / "first.json", {"assembly-1": ["A.1", "B.1"]})
    second = write_groups(tmp_path / "second.json", {"curated-1": ["C.1", "D.1"]})

    assert merge_group_overrides_module.merge_group_overrides([first, second]) == {
        "assembly-1": ["A.1", "B.1"],
        "curated-1": ["C.1", "D.1"],
    }


def test_merge_group_overrides_allows_identical_group_definitions(tmp_path):
    first = write_groups(tmp_path / "first.json", {"assembly-1": ["A.1", "B.1"]})
    second = write_groups(tmp_path / "second.json", {"assembly-1": ["A.1", "B.1"]})

    assert merge_group_overrides_module.merge_group_overrides([first, second]) == {
        "assembly-1": ["A.1", "B.1"],
    }


def test_merge_group_overrides_rejects_conflicting_group_names(tmp_path):
    first = write_groups(tmp_path / "first.json", {"assembly-1": ["A.1", "B.1"]})
    second = write_groups(tmp_path / "second.json", {"assembly-1": ["A.1", "C.1"]})

    with pytest.raises(ValueError, match="defined differently"):
        merge_group_overrides_module.merge_group_overrides([first, second])


def test_merge_group_overrides_rejects_accessions_in_multiple_groups(tmp_path):
    first = write_groups(tmp_path / "first.json", {"assembly-1": ["A.1", "B.1"]})
    second = write_groups(tmp_path / "second.json", {"curated-1": ["B.1", "C.1"]})

    with pytest.raises(ValueError, match="already appear"):
        merge_group_overrides_module.merge_group_overrides([first, second])
