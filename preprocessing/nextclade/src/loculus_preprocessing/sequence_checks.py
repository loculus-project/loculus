from loculus_preprocessing.config import Config

from .datatypes import (
    AnnotationSourceType,
    NucleotideSequence,
    ProcessingAnnotation,
    ProcessingAnnotationAlignment,
    SegmentName,
)

UNALIGNED_NUCLEOTIDE_SYMBOLS = {
    "A",
    "C",
    "G",
    "T",
    "M",
    "R",
    "W",
    "S",
    "Y",
    "K",
    "V",
    "H",
    "D",
    "B",
    "N",
}  # This list should always correspond at minimum to the check defined in the backend


def errors_if_non_iupac(
    unaligned_nucleotide_sequences: dict[SegmentName, NucleotideSequence | None],
) -> list[ProcessingAnnotation]:
    errors: list[ProcessingAnnotation] = []
    for name, sequence in unaligned_nucleotide_sequences.items():
        if sequence:
            non_iupac_symbols = set(sequence.upper()) - UNALIGNED_NUCLEOTIDE_SYMBOLS
            if non_iupac_symbols:
                errors.append(
                    ProcessingAnnotation.from_single(
                        name,
                        AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                        message=(
                            f"Found non-IUPAC symbols in the {name} sequence: "
                            + ", ".join(non_iupac_symbols)
                            + (
                                ". Gap characters (-) are not allowed in raw sequences."
                                if "-" in non_iupac_symbols
                                else ""
                            )
                        ),
                    )
                )
    return errors


def error_on_excess_sequences(
    num_sequences: int,
    config: Config,
) -> list[ProcessingAnnotation]:
    """Check if the number of sequences exceeds the configured maximum per entry."""
    if (
        config.max_sequences_per_entry is not None
        and num_sequences > config.max_sequences_per_entry
    ):
        return [
            ProcessingAnnotation.from_single(
                ProcessingAnnotationAlignment,
                AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                message=(
                    f"Entry has {num_sequences} sequences but the maximum allowed "
                    f"number of sequences per entry is {config.max_sequences_per_entry}."
                ),
            )
        ]
    return []
