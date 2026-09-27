from dataclasses import dataclass, fields
import json
from pathlib import Path
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field

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


NULL_BYTE_PLACEHOLDER = "<NUL>"
UNDECODABLE_PLACEHOLDER = "\ufffd"

_CONTROL_CHARS = [
    *range(0x01, 0x09),  # C0 controls before tab
    0x0B,  # vertical tab
    0x0C,  # form feed
    *range(0x0E, 0x20),  # C0 controls after carriage return, including ESC
    0x7F,  # DEL
    *range(0x80, 0xA0),  # C1 controls
    *range(0xD800, 0xE000),  # lone surrogates
]

_SANITIZE_TABLE = {0x00: NULL_BYTE_PLACEHOLDER} | dict.fromkeys(
    _CONTROL_CHARS, UNDECODABLE_PLACEHOLDER
)


def sanitize_for_json(text: str) -> str:
    """Replace what Postgres rejects inside jsonb (U+0000, lone surrogates) and
    control characters"""
    return text.translate(_SANITIZE_TABLE)


SanitizedText = Annotated[str, AfterValidator(sanitize_for_json)]


class Annotation(BaseModel):
    fileNames: list[SanitizedText]  # noqa: N815
    message: SanitizedText


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
