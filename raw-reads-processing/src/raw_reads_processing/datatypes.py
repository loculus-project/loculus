from dataclasses import dataclass, fields
import json
from pathlib import Path

from pydantic import BaseModel, Field

FileId = str
FileName = str
FileUrl = str


class FileIdAndNameAndReadUrl(BaseModel):
    fileId: FileId  # noqa: N815
    name: FileName
    url: FileUrl


class RequestWithFiles(BaseModel):
    files: list[FileIdAndNameAndReadUrl]
    accessionVersion: str  # noqa: N815


class Annotation(BaseModel):
    fileNames: list[FileName]  # noqa: N815
    message: str


class ValidationResult(BaseModel):
    errors: list[Annotation] = Field(default_factory=list)


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
    def from_json(cls, json_path: Path):
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        wanted = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in wanted})
