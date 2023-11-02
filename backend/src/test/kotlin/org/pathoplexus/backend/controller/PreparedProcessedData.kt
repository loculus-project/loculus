package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.DoubleNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import org.pathoplexus.backend.api.AminoAcidSequence
import org.pathoplexus.backend.api.GeneName
import org.pathoplexus.backend.api.Insertion
import org.pathoplexus.backend.api.NucleotideSequence
import org.pathoplexus.backend.api.PreprocessingAnnotation
import org.pathoplexus.backend.api.PreprocessingAnnotationSource
import org.pathoplexus.backend.api.PreprocessingAnnotationSourceType
import org.pathoplexus.backend.api.ProcessedData
import org.pathoplexus.backend.api.SegmentName
import org.pathoplexus.backend.api.SubmittedProcessedData
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.service.SequenceId

val defaultProcessedData = ProcessedData(
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
        "secondSegment" to "ACGTMRWSYKVHDBN-",
    ),
    nucleotideInsertions = mapOf(
        "main" to listOf(
            Insertion(123, "ACTG"),
        ),
        "secondSegment" to listOf(
            Insertion(1, "ACTG"),
        ),
    ),
    alignedAminoAcidSequences = mapOf(
        "someLongGene" to "ACDEFGHIKLMNPQRSTVWYBZX-*",
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
    sequenceId = "1",
    version = 1,
    data = defaultProcessedData,
    errors = null,
    warnings = null,
)

object PreparedProcessedData {
    fun successfullyProcessed(
        sequenceId: SequenceId = DefaultFiles.firstSequence,
        version: Long = defaultSuccessfulSubmittedData.version,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            version = version,
        )

    fun withNullForFields(sequenceId: SequenceId = DefaultFiles.firstSequence, fields: List<String>) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + fields.map { it to NullNode.instance },
            ),
        )

    fun withUnknownMetadataField(sequenceId: SequenceId = DefaultFiles.firstSequence, fields: List<String>) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + fields.map { it to TextNode("value for $it") },
            ),
        )

    fun withMissingRequiredField(sequenceId: SequenceId = DefaultFiles.firstSequence, fields: List<String>) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata.filterKeys { !fields.contains(it) },
            ),
        )

    fun withWrongTypeForFields(sequenceId: SequenceId = DefaultFiles.firstSequence) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + mapOf(
                    "region" to IntNode(5),
                    "age" to TextNode("not a number"),
                ),
            ),
        )

    fun withWrongDateFormat(sequenceId: SequenceId = DefaultFiles.firstSequence) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + mapOf(
                    "date" to TextNode("1.2.2021"),
                ),
            ),
        )

    fun withWrongPangoLineageFormat(sequenceId: SequenceId = DefaultFiles.firstSequence) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + mapOf(
                    "pangoLineage" to TextNode("A.5.invalid"),
                ),
            ),
        )

    fun withMissingSegmentInUnalignedNucleotideSequences(
        sequenceId: SequenceId = DefaultFiles.firstSequence,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences - segment,
            ),
        )

    fun withMissingSegmentInAlignedNucleotideSequences(
        sequenceId: SequenceId = DefaultFiles.firstSequence,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences - segment,
            ),
        )

    fun withUnknownSegmentInAlignedNucleotideSequences(
        sequenceId: SequenceId = DefaultFiles.firstSequence,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences + (segment to "NNNN"),
            ),
        )

    fun withUnknownSegmentInUnalignedNucleotideSequences(
        sequenceId: SequenceId = DefaultFiles.firstSequence,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences + (segment to "NNNN"),
            ),
        )

    fun withUnknownSegmentInNucleotideInsertions(
        sequenceId: SequenceId = DefaultFiles.firstSequence,
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
        sequenceId: SequenceId = DefaultFiles.firstSequence,
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
        sequenceId: SequenceId = DefaultFiles.firstSequence,
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
        sequenceId: SequenceId = DefaultFiles.firstSequence,
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
        sequenceId: SequenceId = DefaultFiles.firstSequence,
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
        sequenceId: SequenceId = DefaultFiles.firstSequence,
        gene: GeneName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                alignedAminoAcidSequences = defaultProcessedData.alignedAminoAcidSequences - gene,
            ),
        )

    fun withUnknownGeneInAminoAcidSequences(
        sequenceId: SequenceId = DefaultFiles.firstSequence,
        gene: GeneName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(
                alignedAminoAcidSequences = defaultProcessedData.alignedAminoAcidSequences + (gene to "RNRNRN"),
            ),
        )

    fun withUnknownGeneInAminoAcidInsertions(
        sequenceId: SequenceId = DefaultFiles.firstSequence,
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
        sequenceId: SequenceId = DefaultFiles.firstSequence,
        gene: SegmentName,
        length: Int = 123,
    ): SubmittedProcessedData {
        val aminoAcidSequences = defaultProcessedData.alignedAminoAcidSequences.toMutableMap()
        aminoAcidSequences[gene] = "A".repeat(length)

        return defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(alignedAminoAcidSequences = aminoAcidSequences),
        )
    }

    fun withAminoAcidSequenceWithWrongSymbols(
        sequenceId: SequenceId = DefaultFiles.firstSequence,
        gene: SegmentName,
    ): SubmittedProcessedData {
        val aminoAcidSequence = defaultProcessedData.alignedAminoAcidSequences.toMutableMap()
        aminoAcidSequence[gene] = "ÄÖ" + aminoAcidSequence[gene]!!.substring(2)

        return defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(alignedAminoAcidSequences = aminoAcidSequence),
        )
    }

    fun withAminoAcidInsertionsWithWrongSymbols(
        sequenceId: SequenceId = DefaultFiles.firstSequence,
        gene: SegmentName,
    ): SubmittedProcessedData {
        val aminoAcidInsertions = defaultProcessedData.aminoAcidInsertions.toMutableMap()
        aminoAcidInsertions[gene] = listOf(Insertion(123, "ÄÖ"))

        return defaultSuccessfulSubmittedData.withValues(
            sequenceId = sequenceId,
            data = defaultProcessedData.withValues(aminoAcidInsertions = aminoAcidInsertions),
        )
    }

    fun withErrors(sequenceId: SequenceId = DefaultFiles.firstSequence) =
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

    fun withWarnings(sequenceId: SequenceId = DefaultFiles.firstSequence) =
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
    sequenceId: SequenceId? = null,
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
    alignedAminoAcidSequences: Map<GeneName, AminoAcidSequence>? = null,
    aminoAcidInsertions: Map<GeneName, List<Insertion>>? = null,
) = ProcessedData(
    metadata = metadata ?: this.metadata,
    unalignedNucleotideSequences = unalignedNucleotideSequences ?: this.unalignedNucleotideSequences,
    alignedNucleotideSequences = alignedNucleotideSequences ?: this.alignedNucleotideSequences,
    nucleotideInsertions = nucleotideInsertions ?: this.nucleotideInsertions,
    alignedAminoAcidSequences = alignedAminoAcidSequences ?: this.alignedAminoAcidSequences,
    aminoAcidInsertions = aminoAcidInsertions ?: this.aminoAcidInsertions,
)
