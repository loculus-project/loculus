"""Metadata filtering utilities for schema-aware filtering."""

from typing import Any

from ..config import InstanceConfig
from ..types import Schema, SchemaField


class MetadataFilter:
    """Helper for parsing and validating metadata filters against organism schema."""

    def __init__(self, instance_config: InstanceConfig, organism: str):
        self.instance_config = instance_config
        self.organism = organism
        self._schema: Schema | None = None

    @property
    def schema(self) -> Schema:
        """Get organism schema (cached)."""
        if self._schema is None:
            self._schema = self.instance_config.get_organism_schema(self.organism)
        return self._schema

    def get_searchable_fields(self) -> set[str]:
        """Get set of searchable field names."""
        searchable = set()
        for field in self.schema["metadata"]:
            if not field.get("notSearchable", False):
                searchable.add(field["name"])
        return searchable

    def get_field_info(self, field_name: str) -> SchemaField:
        """Get information about a specific field."""
        for field in self.schema["metadata"]:
            if field["name"] == field_name:
                return field
        raise ValueError(f"Field '{field_name}' not found in schema")

    def validate_filter(self, filter_expr: str) -> dict[str, str]:
        """Parse and validate a filter expression."""
        # Parse "field=value", "field>=value", "field<=value" etc.
        operators = [">=", "<=", "="]

        for op in operators:
            if op in filter_expr:
                parts = filter_expr.split(op, 1)
                if len(parts) != 2:
                    continue

                field, value = parts
                field = field.strip()
                value = value.strip()

                # Validate field exists and is searchable
                searchable_fields = self.get_searchable_fields()
                if field not in searchable_fields:
                    available = ", ".join(sorted(searchable_fields))
                    raise ValueError(
                        f"Field '{field}' is not searchable for organism "
                        f"'{self.organism}'. "
                        f"Available fields: {available}"
                    )

                # Get field info for additional validation
                field_info = self.get_field_info(field)

                # Validate range operators for range-searchable fields
                if op in [">=", "<="] and not field_info.get("rangeSearch", False):
                    raise ValueError(
                        f"Field '{field}' does not support range search (>=, <=). "
                        f"Use = operator instead."
                    )

                return {
                    "field": field,
                    "operator": op,
                    "value": value,
                    "field_info": field_info,  # type: ignore[dict-item]
                }

        raise ValueError(
            f"Invalid filter expression: '{filter_expr}'. "
            f"Use format: field=value, field>=value, or field<=value"
        )

    def parse_filters(self, filters: list[str]) -> dict[str, Any]:
        """Parse multiple filter expressions into LAPIS query parameters."""
        if not filters:
            return {}

        params = {}
        for filter_expr in filters:
            parsed = self.validate_filter(filter_expr)
            field = parsed["field"]
            operator = parsed["operator"]
            value = parsed["value"]

            # Convert to LAPIS parameter format
            if operator == "=":
                params[field] = value
            elif operator == ">=":
                # For range fields, LAPIS expects fieldFrom parameter
                params[f"{field}From"] = value
            elif operator == "<=":
                # For range fields, LAPIS expects fieldTo parameter
                params[f"{field}To"] = value

        return params

    def suggest_fields(self, category: str | None = None) -> list[str]:
        """Suggest searchable fields, optionally filtered by category."""
        fields = []
        for field in self.schema["metadata"]:
            if field.get("notSearchable", False):
                continue

            if category and field.get("header") != category:
                continue

            fields.append(field["name"])

        return sorted(fields)

    def get_field_categories(self) -> dict[str, list[str]]:
        """Get searchable fields grouped by category."""
        categories: dict[str, list[str]] = {}
        for field in self.schema["metadata"]:
            if field.get("notSearchable", False):
                continue

            category = field.get("header", "Other")
            if category not in categories:
                categories[category] = []
            categories[category].append(field["name"])

        # Sort fields within each category
        for category in categories:
            categories[category].sort()

        return categories

    def get_usage_examples(self, max_examples: int = 3) -> list[str]:
        """Get example filter expressions for this organism."""
        examples = []
        field_count = 0

        for field in self.schema["metadata"]:
            if field.get("notSearchable", False):
                continue

            if field_count >= max_examples:
                break

            field_name = field["name"]
            field_type = field["type"]

            # Generate appropriate example based on field type
            if field_type == "string":
                if "country" in field_name.lower():
                    examples.append(f"--filter {field_name}=USA")
                elif "host" in field_name.lower():
                    examples.append(f"--filter {field_name}=human")
                else:
                    examples.append(f"--filter {field_name}=value")
            elif field_type in ["int", "float"]:
                if field.get("rangeSearch"):
                    examples.append(f"--filter {field_name}>=100")
                else:
                    examples.append(f"--filter {field_name}=100")
            elif field_type == "date":
                if field.get("rangeSearch"):
                    examples.append(f"--filter {field_name}>=2024-01-01")
                else:
                    examples.append(f"--filter {field_name}=2024-01-01")
            elif field_type == "boolean":
                examples.append(f"--filter {field_name}=true")

            field_count += 1

        return examples
