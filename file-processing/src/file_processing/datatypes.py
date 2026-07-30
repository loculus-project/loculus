from pydantic import BaseModel, Field

FileId = str
FileName = str
FileUrl = str


class FileIdAndNameAndReadUrl(BaseModel):
    fileId: FileId
    name: FileName
    url: FileUrl


class RequestWithFiles(BaseModel):
    files: list[FileIdAndNameAndReadUrl]
    accessionVersion: str


class Annotation(BaseModel):
    fileNames: list[FileName]
    message: str


class ValidationResult(BaseModel):
    errors: list[Annotation] = Field(default_factory=list)
