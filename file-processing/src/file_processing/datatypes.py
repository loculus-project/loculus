from enum import StrEnum, unique

from pydantic import BaseModel


@unique
class FileCategory(StrEnum):
    RAW_READS = "rawReads"
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
