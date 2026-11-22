"""Types of the submission pipeline itself: entry statuses and the keys that identify entries.

Kept independent of the database layer, so any module can use them."""

import logging
from dataclasses import dataclass
from enum import StrEnum

logger = logging.getLogger(__name__)


class StatusAll(StrEnum):
    READY_TO_SUBMIT = "READY_TO_SUBMIT"
    SUBMITTED_PROJECT = "SUBMITTED_PROJECT"
    SUBMITTED_SAMPLE = "SUBMITTED_SAMPLE"
    SUBMITTED_RAW_READS = "SUBMITTED_RAW_READS"
    SUBMITTING_ASSEMBLY = "SUBMITTING_ASSEMBLY"
    SUBMITTED_ALL = "SUBMITTED_ALL"
    SENT_TO_LOCULUS = "SENT_TO_LOCULUS"
    HAS_ERRORS_EXT_METADATA_UPLOAD = "HAS_ERRORS_EXT_METADATA_UPLOAD"


class Status(StrEnum):
    READY = "READY"
    SUBMITTING = "SUBMITTING"
    SUBMITTED = "SUBMITTED"
    HAS_ERRORS = "HAS_ERRORS"
    WAITING = "WAITING"  # Only for assembly creation


type Accession = str


type Version = int


@dataclass(frozen=True)
class AccessionVersion:
    accession: Accession
    version: Version

    @classmethod
    def from_string(cls, s: str) -> "AccessionVersion":
        if s.count(".") != 1:
            msg = (
                f"Invalid AccessionVersion string '{s}': "
                "expected exactly one '.' separating accession and version"
            )
            raise ValueError(msg)
        accession_str, version_str = s.split(".", 1)
        return cls(
            accession=accession_str,
            version=int(version_str),
        )

    def __post_init__(self):
        if not isinstance(self.version, int):
            msg = "version must be an int"
            logger.error(msg)
            raise TypeError(msg)


@dataclass(frozen=True)
class ProjectId:
    project_id: int | None
