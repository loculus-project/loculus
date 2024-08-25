from .datatypes import (
    AnnotationSource,
    AnnotationSourceType,
    NucleotideSequence,
    ProcessingAnnotation,
    SegmentName,
)

NUCLEOTIDE_SYMBOLS = {
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
    "-",
}  # This list should always correspond at minimum to the check defined in the backend


def errors_if_non_iupac(
    unaligned_nucleotide_sequences: dict[SegmentName, NucleotideSequence],
) -> list[ProcessingAnnotation]:
    errors: list[ProcessingAnnotation] = []
    for segment, sequence in unaligned_nucleotide_sequences.items():
        if sequence:
            non_iupac_symbols = set(sequence) - NUCLEOTIDE_SYMBOLS
            if non_iupac_symbols:
                errors.append(
                    ProcessingAnnotation(
                        source=AnnotationSource(
                            type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                            segment=segment,
                        ),
                        message=f"Found non-IUPAC symbols in the sequence: {', '.join(non_iupac_symbols)}",
                    )
                )
    return errors
