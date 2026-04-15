# from dataclasses import dataclass

import sqlite3
from typing import Self

from pydantic import BaseModel


class Taxon(BaseModel):
    tax_id: int
    common_name: str | None
    scientific_name: str
    parent_id: int
    depth: int

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> Self:
        return cls.model_validate(dict(row))
