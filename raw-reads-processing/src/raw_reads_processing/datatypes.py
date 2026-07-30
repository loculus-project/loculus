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
