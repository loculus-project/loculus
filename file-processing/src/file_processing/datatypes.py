from enum import StrEnum, unique

from pydantic import BaseModel

FileId = str
FileName = str
FileUrl = str


@unique
class FileCategory(StrEnum):
    RAW_READS = "rawReads"
    ANNOTATIONS = "annotations"


class FileIdAndNameAndReadUrl(BaseModel):
    fileId: FileId
    name: FileName
    url: FileUrl


Files = dict[FileCategory, list[FileIdAndNameAndReadUrl]]


class RequestWithFiles(BaseModel):
    files: Files
    accessionVersion: str


class Annotation(BaseModel):
    fileNames: list[FileName]
    fileCategory: FileCategory = FileCategory.RAW_READS  # noqa: N815
    message: str


class ValidationResult(BaseModel):
    errors: list[Annotation] | None = None
