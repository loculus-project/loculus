#!/usr/bin/env python3
"""Lint values.schema.json for misspelled keywords and broken docs annotations.

values.schema.json carries custom annotations on top of JSON Schema:

    groups             which sections of the Helm chart config reference a value appears in
    docsIncludePrefix  set to false to reset the dotted path shown in the reference
    placeholder        render <placeholder> instead of the literal key

They are read only by docs/src/components/SchemaDocs.astro, which renders
docs/src/content/docs/reference/helm-chart-config.mdx. JSON Schema treats unknown keywords as
annotations and ignores them, so "group" instead of "groups", or "groups": ["referenceGenomes"]
when the page renders group='reference-genome', is silently accepted by helm and by every
validator - the only symptom is a value quietly missing from the published reference. This
script turns those mistakes into errors.

It also catches structural slips that are valid JSON Schema but almost certainly unintended,
such as a "properties" or "additionalProperties" key nested *inside* a properties map.

Usage: python3 kubernetes/utils/check_schema_annotations.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "kubernetes/loculus/values.schema.json"
DOCS_PAGE = REPO_ROOT / "docs/src/content/docs/reference/helm-chart-config.mdx"

# Custom annotations consumed by SchemaDocs.astro, plus errorMessage (ajv-errors).
CUSTOM_KEYWORDS = {"groups", "docsIncludePrefix", "placeholder", "errorMessage"}

# JSON Schema keywords in use in this file.
SCHEMA_KEYWORDS = {
    "$schema", "$id", "$ref", "$comment", "$defs", "definitions",
    "title", "description", "default", "examples", "deprecated",
    "type", "enum", "const", "format",
    "properties", "patternProperties", "additionalProperties", "propertyNames",
    "required", "minProperties", "maxProperties", "dependencies",
    "items", "prefixItems", "additionalItems", "contains", "minItems", "maxItems", "uniqueItems",
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
    "minLength", "maxLength", "pattern",
    "allOf", "anyOf", "oneOf", "not", "if", "then", "else",
}
KNOWN_KEYWORDS = SCHEMA_KEYWORDS | CUSTOM_KEYWORDS

# Structural keywords that are implausible as the name of an actual config value: finding one of
# these as a key inside a properties map means a nesting level was lost. Keywords that make
# perfectly good value names (required, type, default, description, pattern, ...) are excluded.
STRUCTURAL_KEYWORDS = {
    "properties", "patternProperties", "additionalProperties", "propertyNames",
    "allOf", "anyOf", "oneOf", "$ref", "$defs", "definitions", "prefixItems",
}

SINGLE_SCHEMA = {"not", "if", "then", "else", "items", "contains", "propertyNames",
                 "additionalProperties", "additionalItems"}
SCHEMA_LIST = {"allOf", "anyOf", "oneOf", "prefixItems"}
NAMED_SCHEMAS = {"properties", "patternProperties", "definitions", "$defs", "dependencies"}


def docs_groups() -> set[str]:
    """The group names the reference page renders a section for."""
    return set(re.findall(r"group='([^']+)'", DOCS_PAGE.read_text()))


def check(node: object, path: str, errors: list[str], used: dict[str, list[str]]) -> None:
    if not isinstance(node, dict):
        return

    for key in node:
        if key not in KNOWN_KEYWORDS:
            hint = " (did you mean 'groups'? only the plural is read)" if key == "group" else ""
            errors.append(f"{path}: unknown keyword {key!r}{hint}")

    groups = node.get("groups")
    if groups is not None:
        if not isinstance(groups, list) or not all(isinstance(g, str) for g in groups):
            errors.append(f"{path}.groups: must be a list of strings, got {groups!r}")
        else:
            for group in groups:
                used.setdefault(group, []).append(path)

    for keyword in NAMED_SCHEMAS:
        for name, child in (node.get(keyword) or {}).items():
            if name in STRUCTURAL_KEYWORDS:
                errors.append(
                    f"{path}.{keyword}.{name}: a config value named after the structural JSON "
                    f"Schema keyword {name!r} - a lost nesting level?"
                )
            check(child, f"{path}.{keyword}.{name}", errors, used)

    for keyword in SINGLE_SCHEMA:
        if isinstance(node.get(keyword), dict):
            check(node[keyword], f"{path}.{keyword}", errors, used)

    for keyword in SCHEMA_LIST:
        for index, child in enumerate(node.get(keyword) or []):
            check(child, f"{path}.{keyword}[{index}]", errors, used)


def main() -> int:
    rendered = docs_groups()
    if not rendered:
        print(f"error: no group='...' sections found in {DOCS_PAGE}", file=sys.stderr)
        return 1

    errors: list[str] = []
    used: dict[str, list[str]] = {}
    check(json.loads(SCHEMA.read_text()), "(root)", errors, used)

    for group in sorted(set(used) - rendered):
        errors.append(
            f"group {group!r} is used by {len(used[group])} value(s) but no section of "
            f"{DOCS_PAGE.relative_to(REPO_ROOT)} renders it, so they are undocumented "
            f"(e.g. {used[group][0]})"
        )
    for group in sorted(rendered - set(used)):
        errors.append(
            f"{DOCS_PAGE.relative_to(REPO_ROOT)} renders a section for group {group!r} but no "
            f"value is annotated with it, so the section is empty"
        )

    if errors:
        print(f"{SCHEMA.relative_to(REPO_ROOT)}: {len(errors)} problem(s):", file=sys.stderr)
        for error in errors:
            print(f"  {error}", file=sys.stderr)
        return 1

    print(f"{SCHEMA.relative_to(REPO_ROOT)}: OK - {len(rendered)} documented groups, "
          f"{sum(len(v) for v in used.values())} annotated values")
    return 0


if __name__ == "__main__":
    sys.exit(main())
