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
UNDECODABLE_PLACEHOLDER = "�"


def sanitize_for_json(text: str) -> str:
    r"""Replace characters that Postgres rejects inside jsonb.

    Anything we quote back to the submitter can carry bytes from their file:
    readtools echoes the offending line verbatim, and file names come from the
    submission. Two kinds of character survive as a Python `str` but make
    Postgres reject the `jsonb` insert with "unsupported Unicode escape
    sequence": U+0000 (serialized as `\u0000`) and lone surrogates (serialized
    as `\udcXX`). The backend writes a whole batch in one transaction, so one
    such character wedges every entry in it, not just the offending one.

    Both are replaced with a visible placeholder so the message still says
    what was wrong with the file.
    """
    if text.isascii() and "\x00" not in text:
        return text
    return "".join(_replacement(char) for char in text)


def _replacement(char: str) -> str:
    if char == "\x00":
        return NULL_BYTE_PLACEHOLDER
    if "\ud800" <= char <= "\udfff":
        return UNDECODABLE_PLACEHOLDER
    return char


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
