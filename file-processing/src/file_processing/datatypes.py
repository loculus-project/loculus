import json
from dataclasses import dataclass, fields
from enum import StrEnum, unique
from pathlib import Path
from typing import Self

from pydantic import BaseModel


@unique
class FileCategory(StrEnum):
    RAW_READS = "raw_reads"
    ANNOTATIONS = "annotations"


class FileIdAndNameAndReadUrl(BaseModel):
    fileId: str  # noqa: N815
    name: str
    url: str


Files = dict[FileCategory, list[FileIdAndNameAndReadUrl]]


class Annotation(BaseModel):
    fileName: str | None = None  # noqa: N815
    fileCategory: FileCategory = FileCategory.RAW_READS  # noqa: N815
    message: str


class ResponseWithFiles(BaseModel):
    files: Files
    errors: list[Annotation] | None = None
    warnings: list[Annotation] | None = None


@dataclass
class DeaconSummary:
    time: float
    seqs_in: int
    seqs_out: int
    seqs_out_proportion: float
    bp_in: int
    bp_out: int
    bp_out_proportion: float

    @classmethod
    def from_json(cls, json_path: Path) -> Self:
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        wanted = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in wanted})
