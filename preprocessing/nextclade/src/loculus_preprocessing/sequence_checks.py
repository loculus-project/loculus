from .datatypes import (
    AnnotationSource,
    AnnotationSourceType,
    NucleotideSequence,
    ProcessingAnnotation,
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
    unaligned_nucleotide_sequences: dict[SegmentName, NucleotideSequence],
) -> list[ProcessingAnnotation]:
    errors: list[ProcessingAnnotation] = []
    for segment, sequence in unaligned_nucleotide_sequences.items():
        if sequence:
            non_iupac_symbols = set(sequence.upper()) - UNALIGNED_NUCLEOTIDE_SYMBOLS
            if non_iupac_symbols:
                errors.append(
                    ProcessingAnnotation(
                        unprocessedFields=[
                            AnnotationSource(
                                name=segment, type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE
                            )
                        ],
                        processedFields=[
                            AnnotationSource(
                                name=segment, type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE
                            )
                        ],
                        message=(
                            f"Found non-IUPAC symbols in the {segment} sequence: "
                            + ", ".join(non_iupac_symbols) + (". Gap characters (-) are not allowed in raw sequences." if "-" in non_iupac_symbols else "")
                        ),
                    )
                )
    return errors
