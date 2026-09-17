"""The per-sequence `annotation` object Nextclade emits, as far as we rely on it.

Only the fields the EMBL renderer reads are modelled. Nextclade 3.23.0 puts 12 keys on a
gene, 9 on a CDS and 18 on a segment; we use 3, 2 and 4 of them. Unmodelled keys are
ignored on purpose -- `extra="forbid"` would turn a harmless upstream addition into a
processing outage for every sequence of every organism.

The shapes follow `packages/nextclade-schemas/output-json.schema.json` in nextclade 3.23.0
(`GeneMap`, `Gene`, `Cds`, `CdsSegment`, `Truncation`, `GeneStrand`, `Phase`), which is
generated from the Rust types and is the authority for what may appear here.
`tests/nextclade_annotation_full_range.json` is an annotation that exercises every arm of
those unions -- including the truncation and wraparound cases no real dataset we have
produces -- and validates against that schema.

Every field modelled here is `required` in that schema, so none of them has a default: a
missing `cdses` or `attributes` is a broken annotation, not an empty one, and defaulting it
would put back exactly the silent degradation this module exists to prevent.

What this buys over a `TypedDict` is the handful of invariants that cannot be written as a
type, and that the renderer would otherwise assume silently:

- a range's `begin` does not run past its `end`;
- a CDS has at least one segment, because `segments[0]` and `segments[-1]` are read
  unconditionally to find the 5' and 3' ends;
- `phase` is 0, 1 or 2 -- the `Phase` enum's only variants, though the published schema
  widens this to any int8 -- since `/codon_start` is `phase + 1`;
- `truncation` is Nextclade's tagged union, flattened here -- once -- into a plain pair of
  counts, so no consumer has to re-discover that `"none"` and `{"fivePrime": n}` are the
  same field.

How the coordinates are interpreted (transcription order, query space, strand) is the
`loculus_preprocessing.embl` module docstring's business, not this one's.
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
