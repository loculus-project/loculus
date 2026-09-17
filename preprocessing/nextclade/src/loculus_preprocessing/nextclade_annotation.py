"""The per-sequence `annotation` object Nextclade emits, as far as we rely on it.

The shapes follow `packages/nextclade-schemas/output-json.schema.json` in nextclade 3.23.0
(`GeneMap`, `Gene`, `Cds`, `CdsSegment`, `Truncation`, `GeneStrand`, `Phase`), which is
generated from the Rust types and is the authority for what may appear here.
"""

from collections.abc import Mapping
from typing import Annotated, Literal, NamedTuple

from pydantic import BaseModel, BeforeValidator, Field, model_validator

# GFF3 attributes are multi-valued, so Nextclade reports every value as a list.
GffAttributes = dict[str, list[str]]


class NextcladeRange(BaseModel):
    """A 0-based, half-open interval in query space, like a Python slice."""

    begin: int
    end: int

    @model_validator(mode="after")
    def _begin_precedes_end(self) -> "NextcladeRange":
        if self.begin > self.end:
            msg = f"range begins at {self.begin}, past its end at {self.end}"
            raise ValueError(msg)
        return self


class Truncation(NamedTuple):
    """Nucleotides missing from a segment at each end."""

    five_prime: int
    three_prime: int


def _flatten_truncation(value: object) -> object:
    """Nextclade serialises a Rust enum: `"none"`, or a single-key object.

    The arms are `{"fivePrime": n}`, `{"threePrime": n}` and `{"both": [n, m]}`.
    """
    if value == "none":
        return Truncation(0, 0)
    if isinstance(value, Mapping) and len(value) == 1:
        [(arm, amount)] = value.items()
        if arm == "fivePrime":
            return Truncation(amount, 0)
        if arm == "threePrime":
            return Truncation(0, amount)
        if arm == "both":
            five_prime, three_prime = amount
            return Truncation(five_prime, three_prime)
    msg = f"expected 'none' or one of fivePrime/threePrime/both, got {value!r}"
    raise ValueError(msg)


class NextcladeSegment(BaseModel):
    """One contiguous stretch of a CDS; a spliced CDS has several."""

    range: NextcladeRange
    strand: Literal["+", "-"]
    phase: Literal[0, 1, 2]
    truncation: Annotated[Truncation, BeforeValidator(_flatten_truncation)]


class NextcladeCds(BaseModel):
    segments: Annotated[list[NextcladeSegment], Field(min_length=1)]
    attributes: GffAttributes


class NextcladeGene(BaseModel):
    range: NextcladeRange
    cdses: list[NextcladeCds]
    attributes: GffAttributes


class NextcladeAnnotation(BaseModel):
    genes: list[NextcladeGene]
