import sqlite3
from typing import Self
from pydantic import BaseModel


class Taxon(BaseModel):
    tax_id: int
    common_name: str | None
    scientific_name: str | None
    parent_id: int
    depth: int

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> Self:
        return cls.model_validate(dict(row))


class SubtreeRequestBody(BaseModel):
    tax_ids: list[str]
