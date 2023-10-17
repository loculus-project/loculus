package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.DoubleNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.service.AminoAcidSequence
import org.pathoplexus.backend.service.GeneName
import org.pathoplexus.backend.service.Insertion
import org.pathoplexus.backend.service.NucleotideSequence
import org.pathoplexus.backend.service.PreprocessingAnnotation
import org.pathoplexus.backend.service.PreprocessingAnnotationSource
import org.pathoplexus.backend.service.PreprocessingAnnotationSourceType
import org.pathoplexus.backend.service.ProcessedData
import org.pathoplexus.backend.service.SegmentName
import org.pathoplexus.backend.service.SubmittedProcessedData

private val defaultProcessedData = ProcessedData(
    metadata = mapOf(
        "date" to TextNode("2002-12-15"),
        "host" to TextNode("google.com"),
        "region" to TextNode("Europe"),
        "country" to TextNode("Spain"),
        "age" to IntNode(42),
        "qc" to DoubleNode(0.9),
        "pangoLineage" to TextNode("XBB.1.5"),
    ),
    unalignedNucleotideSequences = mapOf(
        "main" to "NNACTGNN",
        "secondSegment" to "NNATAGN",
    ),
    alignedNucleotideSequences = mapOf(
        "main" to "ATTAAAGGTTTATACCTTCCCAGGTAACAAACCAACCAACTTTCGATCT",
        "secondSegment" to "ATAG",
    ),
    nucleotideInsertions = mapOf(
        "main" to listOf(
            Insertion(123, "ACTG"),
        ),
        "secondSegment" to listOf(
            Insertion(1, "ACTG"),
        ),
    ),
    aminoAcidSequences = mapOf(
        "someLongGene" to "MYSFVSEETGTLIVNSVLLFL",
        "someShortGene" to "MADS",
    ),
    aminoAcidInsertions = mapOf(
        "someLongGene" to listOf(
            Insertion(123, "RNRNRN"),
        ),
        "someShortGene" to listOf(
            Insertion(123, "RN"),
        ),
    ),
)

private val defaultSuccessfulSubmittedData = SubmittedProcessedData(
    sequenceId = 1,
    version = 1,
    data = defaultProcessedData,
    errors = null,
    warnings = null,
)

object PreparedProcessedData {
    fun successfullyProcessed(sequenceId: Long = DefaultFiles.firstSequence) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
        )

    fun withMetadataAndNucleotideSequence(
        sequenceId: Long = DefaultFiles.firstSequence,
        metadata: Map<String, JsonNode>,
        unalignedNucleotideSequences: Map<SegmentName, NucleotideSequence>,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = metadata,
                unalignedNucleotideSequences = unalignedNucleotideSequences,
            ),
        )

    fun withNullForFields(sequenceId: Long = DefaultFiles.firstSequence, fields: List<String>) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + fields.map { it to NullNode.instance },
            ),
        )

    fun withUnknownMetadataField(sequenceId: Long = DefaultFiles.firstSequence, fields: List<String>) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + fields.map { it to TextNode("value for $it") },
            ),
        )

    fun withMissingRequiredField(sequenceId: Long = DefaultFiles.firstSequence, fields: List<String>) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata.filterKeys { !fields.contains(it) },
            ),
        )

    fun withWrongTypeForFields(sequenceId: Long = DefaultFiles.firstSequence) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + mapOf(
                    "region" to IntNode(5),
                    "age" to TextNode("not a number"),
                ),
            ),
        )

    fun withWrongDateFormat(sequenceId: Long = DefaultFiles.firstSequence) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + mapOf(
                    "date" to TextNode("1.2.2021"),
                ),
            ),
        )

    fun withWrongPangoLineageFormat(sequenceId: Long = DefaultFiles.firstSequence) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + mapOf(
                    "pangoLineage" to TextNode("A.5.invalid"),
                ),
            ),
        )

    fun withMissingSegmentInUnalignedNucleotideSequences(
        sequenceId: Long = DefaultFiles.firstSequence,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences - segment,
            ),
        )

    fun withMissingSegmentInAlignedNucleotideSequences(
        sequenceId: Long = DefaultFiles.firstSequence,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences - segment,
            ),
        )

    fun withUnknownSegmentInAlignedNucleotideSequences(
        sequenceId: Long = DefaultFiles.firstSequence,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences + (segment to "NNNN"),
            ),
        )

    fun withUnknownSegmentInUnalignedNucleotideSequences(
        sequenceId: Long = DefaultFiles.firstSequence,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences + (segment to "NNNN"),
            ),
        )

    fun withUnknownSegmentInNucleotideInsertions(
        sequenceId: Long = DefaultFiles.firstSequence,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
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
        sequenceId: Long = DefaultFiles.firstSequence,
        segment: SegmentName,
        length: Int = 123,
    ): SubmittedProcessedData {
        val alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences.toMutableMap()
        alignedNucleotideSequences[segment] = "A".repeat(length)

        return defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(alignedNucleotideSequences = alignedNucleotideSequences),
        )
    }

    fun withAlignedNucleotideSequenceWithWrongSymbols(
        sequenceId: Long = DefaultFiles.firstSequence,
        segment: SegmentName,
    ): SubmittedProcessedData {
        val alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences.toMutableMap()
        alignedNucleotideSequences[segment] = "ÄÖ" + alignedNucleotideSequences[segment]!!.substring(2)

        return defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(alignedNucleotideSequences = alignedNucleotideSequences),
        )
    }

    fun withUnalignedNucleotideSequenceWithWrongSymbols(
        sequenceId: Long = DefaultFiles.firstSequence,
        segment: SegmentName,
    ): SubmittedProcessedData {
        val unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences.toMutableMap()
        unalignedNucleotideSequences[segment] = "ÄÖ" + unalignedNucleotideSequences[segment]!!.substring(2)

        return defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(unalignedNucleotideSequences = unalignedNucleotideSequences),
        )
    }

    fun withNucleotideInsertionsWithWrongSymbols(
        sequenceId: Long = DefaultFiles.firstSequence,
        segment: SegmentName,
    ): SubmittedProcessedData {
        val nucleotideInsertions = defaultProcessedData.nucleotideInsertions.toMutableMap()
        nucleotideInsertions[segment] = listOf(Insertion(123, "ÄÖ"))

        return defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(nucleotideInsertions = nucleotideInsertions),
        )
    }

    fun withMissingGeneInAminoAcidSequences(
        sequenceId: Long = DefaultFiles.firstSequence,
        gene: GeneName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                aminoAcidSequences = defaultProcessedData.aminoAcidSequences - gene,
            ),
        )

    fun withUnknownGeneInAminoAcidSequences(
        sequenceId: Long = DefaultFiles.firstSequence,
        gene: GeneName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                aminoAcidSequences = defaultProcessedData.aminoAcidSequences + (gene to "RNRNRN"),
            ),
        )

    fun withUnknownGeneInAminoAcidInsertions(
        sequenceId: Long = DefaultFiles.firstSequence,
        gene: GeneName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
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
        sequenceId: Long = DefaultFiles.firstSequence,
        gene: SegmentName,
        length: Int = 123,
    ): SubmittedProcessedData {
        val aminoAcidSequences = defaultProcessedData.aminoAcidSequences.toMutableMap()
        aminoAcidSequences[gene] = "A".repeat(length)

        return defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(aminoAcidSequences = aminoAcidSequences),
        )
    }

    fun withAminoAcidSequenceWithWrongSymbols(
        sequenceId: Long = DefaultFiles.firstSequence,
        gene: SegmentName,
    ): SubmittedProcessedData {
        val aminoAcidSequence = defaultProcessedData.aminoAcidSequences.toMutableMap()
        aminoAcidSequence[gene] = "ÄÖ" + aminoAcidSequence[gene]!!.substring(2)

        return defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(aminoAcidSequences = aminoAcidSequence),
        )
    }

    fun withAminoAcidInsertionsWithWrongSymbols(
        sequenceId: Long = DefaultFiles.firstSequence,
        gene: SegmentName,
    ): SubmittedProcessedData {
        val aminoAcidInsertions = defaultProcessedData.aminoAcidInsertions.toMutableMap()
        aminoAcidInsertions[gene] = listOf(Insertion(123, "ÄÖ"))

        return defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(aminoAcidInsertions = aminoAcidInsertions),
        )
    }

    fun withErrors(sequenceId: Long = DefaultFiles.firstSequence) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            errors = listOf(
                PreprocessingAnnotation(
                    source = listOf(
                        PreprocessingAnnotationSource(
                            PreprocessingAnnotationSourceType.Metadata,
                            "host",
                        ),
                    ),
                    "Not this kind of host",
                ),
                PreprocessingAnnotation(
                    source = listOf(
                        PreprocessingAnnotationSource(
                            PreprocessingAnnotationSourceType.NucleotideSequence,
                            "main",
                        ),
                    ),
                    "dummy nucleotide sequence error",
                ),
            ),
        )

    fun withWarnings(sequenceId: Long = DefaultFiles.firstSequence) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            warnings = listOf(
                PreprocessingAnnotation(
                    source = listOf(
                        PreprocessingAnnotationSource(
                            PreprocessingAnnotationSourceType.Metadata,
                            "host",
                        ),
                    ),
                    "Not this kind of host",
                ),
                PreprocessingAnnotation(
                    source = listOf(
                        PreprocessingAnnotationSource(
                            PreprocessingAnnotationSourceType.NucleotideSequence,
                            "main",
                        ),
                    ),
                    "dummy nucleotide sequence error",
                ),
            ),
        )
}

fun SubmittedProcessedData.withValues(
    sequenceId: Long? = null,
    version: Long? = null,
    data: ProcessedData? = null,
    errors: List<PreprocessingAnnotation>? = null,
    warnings: List<PreprocessingAnnotation>? = null,
) = SubmittedProcessedData(
    sequenceId = sequenceId ?: this.sequenceId,
    version = version ?: this.version,
    data = data ?: this.data,
    errors = errors ?: this.errors,
    warnings = warnings ?: this.warnings,
)

fun ProcessedData.withValues(
    metadata: Map<String, JsonNode>? = null,
    unalignedNucleotideSequences: Map<SegmentName, NucleotideSequence>? = null,
    alignedNucleotideSequences: Map<SegmentName, NucleotideSequence>? = null,
    nucleotideInsertions: Map<SegmentName, List<Insertion>>? = null,
    aminoAcidSequences: Map<GeneName, AminoAcidSequence>? = null,
    aminoAcidInsertions: Map<GeneName, List<Insertion>>? = null,
) = ProcessedData(
    metadata = metadata ?: this.metadata,
    unalignedNucleotideSequences = unalignedNucleotideSequences ?: this.unalignedNucleotideSequences,
    alignedNucleotideSequences = alignedNucleotideSequences ?: this.alignedNucleotideSequences,
    nucleotideInsertions = nucleotideInsertions ?: this.nucleotideInsertions,
    aminoAcidSequences = aminoAcidSequences ?: this.aminoAcidSequences,
    aminoAcidInsertions = aminoAcidInsertions ?: this.aminoAcidInsertions,
)
