"""Common type definitions for Loculus CLI."""

from typing import TypedDict


class SchemaFieldRequired(TypedDict):
    """Required schema field properties."""

    name: str
    type: str


class SchemaFieldOptional(TypedDict, total=False):
    """Optional schema field properties."""

    displayName: str
    notSearchable: bool
    rangeSearch: bool
    header: str
    autocomplete: bool
    substringSearch: bool


class SchemaField(SchemaFieldRequired, SchemaFieldOptional):
    """Complete schema field definition."""

    pass


class Schema(TypedDict):
    """Schema definition."""

    metadata: list[SchemaField]
    organismName: str
    primaryKey: str
    tableColumns: list[str]
