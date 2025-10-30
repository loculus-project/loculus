package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.node.BooleanNode
import com.fasterxml.jackson.databind.node.DoubleNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import org.loculus.backend.api.FileCategoryFilesMap
import org.loculus.backend.api.GeneName
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.Insertion
import org.loculus.backend.api.PreprocessingAnnotation
import org.loculus.backend.api.PreprocessingAnnotationSource
import org.loculus.backend.api.PreprocessingAnnotationSourceType
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SegmentName
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.controller.DUMMY_ORGANISM_MAIN_SEQUENCE
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.Version

const val MAIN_SEGMENT = "main"
const val SOME_LONG_GENE = "someLongGene"
const val SOME_SHORT_GENE = "someShortGene"

val defaultProcessedData = ProcessedData(
    metadata = mapOf(
        "date" to TextNode("2002-12-15"),
        "host" to TextNode("google.com"),
        "region" to TextNode("Europe"),
        "country" to TextNode("Spain"),
        "age" to IntNode(42),
        "qc" to DoubleNode(0.987654321),
        "pangoLineage" to TextNode("XBB.1.5"),
        "division" to NullNode.instance,
        "dateSubmitted" to NullNode.instance,
        "sex" to NullNode.instance,
        "booleanColumn" to BooleanNode.TRUE,
        "insdcAccessionFull" to NullNode.instance,
        "other_db_accession" to NullNode.instance,
    ),
    unalignedNucleotideSequences = mapOf(
        MAIN_SEGMENT to "NNACTGNN",
    ),
    alignedNucleotideSequences = mapOf(
        MAIN_SEGMENT to DUMMY_ORGANISM_MAIN_SEQUENCE,
    ),
    nucleotideInsertions = mapOf(
        MAIN_SEGMENT to listOf(
            Insertion(123, "ACTG"),
        ),
    ),
    alignedAminoAcidSequences = mapOf(
        SOME_LONG_GENE to "ACDEFGHIKLMNPQRSTVWYBZX-*",
        SOME_SHORT_GENE to "MADS",
    ),
    aminoAcidInsertions = mapOf(
        SOME_LONG_GENE to listOf(
            Insertion(123, "RNRNRN"),
        ),
        SOME_SHORT_GENE to listOf(
            Insertion(123, "RN"),
        ),
    ),
    files = null,
)

val defaultProcessedDataMultiSegmented = ProcessedData(
    metadata = mapOf(
        "date" to TextNode("2002-12-15"),
        "host" to TextNode("google.com"),
        "region" to TextNode("Europe"),
        "country" to TextNode("Spain"),
        "specialOtherField" to TextNode("specialOtherValue"),
        "age" to IntNode(42),
        "qc" to DoubleNode(0.9),
        "pangoLineage" to TextNode("XBB.1.5"),
    ),
    unalignedNucleotideSequences = mapOf(
        "notOnlySegment" to "NNACTGNN",
        "secondSegment" to "NNATAGN",
    ),
    alignedNucleotideSequences = mapOf(
        "notOnlySegment" to "ATTA",
        "secondSegment" to "ACGTMRWSYKVHDBN-",
    ),
    nucleotideInsertions = mapOf(
        "notOnlySegment" to listOf(
            Insertion(123, "ACTG"),
        ),
    ),
    alignedAminoAcidSequences = mapOf(
        SOME_LONG_GENE to "ACDEFGHIKLMNPQRSTVWYBZX-*",
        SOME_SHORT_GENE to "MADS",
    ),
    aminoAcidInsertions = mapOf(
        SOME_LONG_GENE to listOf(
            Insertion(123, "RNRNRN"),
        ),
        SOME_SHORT_GENE to listOf(
            Insertion(123, "RN"),
        ),
    ),
    files = null,
)

val defaultProcessedDataWithoutSequences = ProcessedData<GeneticSequence>(
    metadata = mapOf(
        "date" to TextNode("2002-12-15"),
        "host" to TextNode("google.com"),
        "region" to TextNode("Europe"),
        "country" to TextNode("Spain"),
        "division" to NullNode.instance,
    ),
    unalignedNucleotideSequences = emptyMap(),
    alignedNucleotideSequences = emptyMap(),
    nucleotideInsertions = emptyMap(),
    alignedAminoAcidSequences = emptyMap(),
    aminoAcidInsertions = emptyMap(),
    files = null,
)

private val defaultSuccessfulSubmittedData = SubmittedProcessedData(
    accession = "If a test result shows this, processed data was not prepared correctly.",
    version = 1,
    data = defaultProcessedData,
    errors = null,
    warnings = null,
)

private val defaultSuccessfulSubmittedDataMultiSegmented = defaultSuccessfulSubmittedData.copy(
    data = defaultProcessedDataMultiSegmented,
)

object PreparedProcessedData {
    fun successfullyProcessed(accession: Accession, version: Long = defaultSuccessfulSubmittedData.version) =
        defaultSuccessfulSubmittedData.copy(
            accession = accession,
            version = version,
        )

    fun successfullyProcessedOtherOrganismData(
        accession: Accession,
        version: Long = defaultSuccessfulSubmittedDataMultiSegmented.version,
    ) = defaultSuccessfulSubmittedDataMultiSegmented.copy(
        accession = accession,
        version = version,
    )

    fun withNullForFields(accession: Accession, fields: List<String>) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        data = defaultProcessedData.copy(
            metadata = defaultProcessedData.metadata + fields.map { it to NullNode.instance },
        ),
    )

    fun withNullForSequences(accession: Accession, version: Version) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        version = version,
        data = defaultProcessedData.copy(
            alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences.mapValues { null },
            unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences.mapValues { null },
            alignedAminoAcidSequences = defaultProcessedData.alignedAminoAcidSequences.mapValues { null },
        ),
    )

    fun withLowercaseSequences(accession: Accession, version: Version) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        version = version,
        data = defaultProcessedData.copy(
            unalignedNucleotideSequences = mapOf(
                MAIN_SEGMENT to "nactg",
            ),
            alignedNucleotideSequences = mapOf(
                MAIN_SEGMENT to "attaaaggtttataccttcccaggtaacaaaccaaccaactttcgatct",
            ),
            nucleotideInsertions = mapOf(
                MAIN_SEGMENT to listOf(Insertion(123, "actg")),
            ),
            alignedAminoAcidSequences = mapOf(
                SOME_LONG_GENE to "acdefghiklmnpqrstvwybzx-*",
                SOME_SHORT_GENE to "mads",
            ),
            aminoAcidInsertions = mapOf(
                SOME_LONG_GENE to listOf(Insertion(123, "def")),
                SOME_SHORT_GENE to listOf(Insertion(123, "n")),
            ),
        ),
    )

    fun withMissingMetadataFields(
        accession: Accession,
        version: Long = defaultSuccessfulSubmittedData.version,
        absentFields: List<String>,
    ) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        version = version,
        data = defaultProcessedData.copy(
            metadata = defaultProcessedData.metadata.filterKeys { !absentFields.contains(it) },
        ),
    )

    fun withUnknownMetadataField(accession: Accession, fields: List<String>) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        data = defaultProcessedData.copy(
            metadata = defaultProcessedData.metadata + fields.map { it to TextNode("value for $it") },
        ),
    )

    fun withMissingRequiredField(accession: Accession, fields: List<String>) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        data = defaultProcessedData.copy(
            metadata = defaultProcessedData.metadata.filterKeys { !fields.contains(it) },
        ),
    )

    fun withWrongTypeForFields(accession: Accession) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        data = defaultProcessedData.copy(
            metadata = defaultProcessedData.metadata + mapOf(
                "region" to IntNode(5),
                "age" to TextNode("not a number"),
            ),
        ),
    )

    fun withWrongDateFormat(accession: Accession) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        data = defaultProcessedData.copy(
            metadata = defaultProcessedData.metadata + mapOf(
                "date" to TextNode("1.2.2021"),
            ),
        ),
    )

    fun withWrongBooleanFormat(accession: Accession) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        data = defaultProcessedData.copy(
            metadata = defaultProcessedData.metadata + mapOf(
                "booleanColumn" to TextNode("not a boolean"),
            ),
        ),
    )

    fun withMissingSegmentInUnalignedNucleotideSequences(accession: Accession, segment: SegmentName) =
        defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(
                unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences - segment,
            ),
        )

    fun withMissingSegmentInAlignedNucleotideSequences(accession: Accession, segment: SegmentName) =
        defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(
                alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences - segment,
            ),
        )

    fun withUnknownSegmentInAlignedNucleotideSequences(accession: Accession, segment: SegmentName) =
        defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(
                alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences + (segment to "NNNN"),
            ),
        )

    fun withUnknownSegmentInUnalignedNucleotideSequences(accession: Accession, segment: SegmentName) =
        defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(
                unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences + (segment to "NNNN"),
            ),
        )

    fun withUnknownSegmentInNucleotideInsertions(accession: Accession, segment: SegmentName) =
        defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(
                nucleotideInsertions = defaultProcessedData.nucleotideInsertions + (
                    segment to listOf(
                        Insertion(
                            123,
                            "ACTG",
                        ),
                    )
                    ),
            ),
        )

    fun withAlignedNucleotideSequenceOfWrongLength(
        accession: Accession,
        segment: SegmentName,
        length: Int = 123,
    ): SubmittedProcessedData {
        val alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences.toMutableMap()
        alignedNucleotideSequences[segment] = "A".repeat(length)

        return defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(alignedNucleotideSequences = alignedNucleotideSequences),
        )
    }

    fun withAlignedNucleotideSequenceWithWrongSymbols(
        accession: Accession,
        segment: SegmentName,
    ): SubmittedProcessedData {
        val alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences.toMutableMap()
        alignedNucleotideSequences[segment] = "ÄÖ" + alignedNucleotideSequences[segment]!!.substring(2)

        return defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(alignedNucleotideSequences = alignedNucleotideSequences),
        )
    }

    fun withUnalignedNucleotideSequenceWithWrongSymbols(
        accession: Accession,
        segment: SegmentName,
    ): SubmittedProcessedData {
        val unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences.toMutableMap()
        unalignedNucleotideSequences[segment] = "ÄÖ-" + unalignedNucleotideSequences[segment]!!.substring(2)

        return defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(unalignedNucleotideSequences = unalignedNucleotideSequences),
        )
    }

    fun withNucleotideInsertionsWithWrongSymbols(accession: Accession, segment: SegmentName): SubmittedProcessedData {
        val nucleotideInsertions = defaultProcessedData.nucleotideInsertions.toMutableMap()
        nucleotideInsertions[segment] = listOf(Insertion(123, "ÄÖ"))

        return defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(nucleotideInsertions = nucleotideInsertions),
        )
    }

    fun withMissingGeneInAlignedAminoAcidSequences(accession: Accession, gene: GeneName) =
        defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(
                alignedAminoAcidSequences = defaultProcessedData.alignedAminoAcidSequences - gene,
            ),
        )

    fun withUnknownGeneInAlignedAminoAcidSequences(accession: Accession, gene: GeneName) =
        defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(
                alignedAminoAcidSequences = defaultProcessedData.alignedAminoAcidSequences + (gene to "RNRNRN"),
            ),
        )

    fun withUnknownGeneInAminoAcidInsertions(accession: Accession, gene: GeneName) =
        defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(
                aminoAcidInsertions = defaultProcessedData.aminoAcidInsertions + (
                    gene to listOf(
                        Insertion(
                            123,
                            "RNRNRN",
                        ),
                    )
                    ),
            ),
        )

    fun withAminoAcidSequenceOfWrongLength(
        accession: Accession,
        gene: SegmentName,
        length: Int = 123,
    ): SubmittedProcessedData {
        val alignedAminoAcidSequences = defaultProcessedData.alignedAminoAcidSequences.toMutableMap()
        alignedAminoAcidSequences[gene] = "A".repeat(length)

        return defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(alignedAminoAcidSequences = alignedAminoAcidSequences),
        )
    }

    fun withAminoAcidSequenceWithWrongSymbols(accession: Accession, gene: SegmentName): SubmittedProcessedData {
        val aminoAcidSequence = defaultProcessedData.alignedAminoAcidSequences.toMutableMap()
        aminoAcidSequence[gene] = "ÄÖ" + aminoAcidSequence[gene]!!.substring(2)

        return defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(alignedAminoAcidSequences = aminoAcidSequence),
        )
    }

    fun withAminoAcidInsertionsWithWrongSymbols(accession: Accession, gene: SegmentName): SubmittedProcessedData {
        val aminoAcidInsertions = defaultProcessedData.aminoAcidInsertions.toMutableMap()
        aminoAcidInsertions[gene] = listOf(Insertion(123, "ÄÖ"))

        return defaultSuccessfulSubmittedData.copy(
            accession = accession,
            data = defaultProcessedData.copy(aminoAcidInsertions = aminoAcidInsertions),
        )
    }

    fun withErrors(accession: Accession) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        errors = listOf(
            PreprocessingAnnotation(
                unprocessedFields = listOf(
                    PreprocessingAnnotationSource(
                        PreprocessingAnnotationSourceType.Metadata,
                        "host",
                    ),
                ),
                processedFields = listOf(
                    PreprocessingAnnotationSource(
                        PreprocessingAnnotationSourceType.Metadata,
                        "host",
                    ),
                ),
                "Not this kind of host",
            ),
            PreprocessingAnnotation(
                unprocessedFields = listOf(
                    PreprocessingAnnotationSource(
                        PreprocessingAnnotationSourceType.NucleotideSequence,
                        MAIN_SEGMENT,
                    ),
                ),
                processedFields = listOf(
                    PreprocessingAnnotationSource(
                        PreprocessingAnnotationSourceType.NucleotideSequence,
                        MAIN_SEGMENT,
                    ),
                ),
                "dummy nucleotide sequence error",
            ),
        ),
    )

    fun withWarnings(accession: Accession) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        warnings = listOf(
            PreprocessingAnnotation(
                unprocessedFields = listOf(
                    PreprocessingAnnotationSource(
                        PreprocessingAnnotationSourceType.Metadata,
                        "host",
                    ),
                ),
                processedFields = listOf(
                    PreprocessingAnnotationSource(
                        PreprocessingAnnotationSourceType.Metadata,
                        "host",
                    ),
                ),
                "Not this kind of host",
            ),
            PreprocessingAnnotation(
                unprocessedFields = listOf(
                    PreprocessingAnnotationSource(
                        PreprocessingAnnotationSourceType.NucleotideSequence,
                        MAIN_SEGMENT,
                    ),
                ),
                processedFields = listOf(
                    PreprocessingAnnotationSource(
                        PreprocessingAnnotationSourceType.NucleotideSequence,
                        MAIN_SEGMENT,
                    ),
                ),
                "dummy nucleotide sequence error",
            ),
        ),
    )

    fun withFiles(accession: Accession, files: FileCategoryFilesMap) = defaultSuccessfulSubmittedData.copy(
        accession = accession,
        data = defaultProcessedData.copy(
            files = files,
        ),
    )
}
