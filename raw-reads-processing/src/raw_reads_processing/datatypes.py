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

_SANITIZE_TABLE = {0x00: NULL_BYTE_PLACEHOLDER} | dict.fromkeys(
    range(0xD800, 0xE000), UNDECODABLE_PLACEHOLDER
)


def sanitize_for_json(text: str) -> str:
    """Replace the characters Postgres rejects inside jsonb: U+0000 and lone
    surrogates."""
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
