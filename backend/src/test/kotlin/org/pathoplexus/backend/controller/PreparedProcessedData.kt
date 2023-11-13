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
import org.pathoplexus.backend.service.Accession

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
    accession = "1",
    version = 1,
    data = defaultProcessedData,
    errors = null,
    warnings = null,
)

object PreparedProcessedData {
    fun successfullyProcessed(
        accession: Accession = DefaultFiles.firstAccession,
        version: Long = defaultSuccessfulSubmittedData.version,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            version = version,
        )

    fun withNullForFields(accession: Accession = DefaultFiles.firstAccession, fields: List<String>) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + fields.map { it to NullNode.instance },
            ),
        )

    fun withUnknownMetadataField(accession: Accession = DefaultFiles.firstAccession, fields: List<String>) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + fields.map { it to TextNode("value for $it") },
            ),
        )

    fun withMissingRequiredField(accession: Accession = DefaultFiles.firstAccession, fields: List<String>) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata.filterKeys { !fields.contains(it) },
            ),
        )

    fun withWrongTypeForFields(accession: Accession = DefaultFiles.firstAccession) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + mapOf(
                    "region" to IntNode(5),
                    "age" to TextNode("not a number"),
                ),
            ),
        )

    fun withWrongDateFormat(accession: Accession = DefaultFiles.firstAccession) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + mapOf(
                    "date" to TextNode("1.2.2021"),
                ),
            ),
        )

    fun withWrongPangoLineageFormat(accession: Accession = DefaultFiles.firstAccession) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + mapOf(
                    "pangoLineage" to TextNode("A.5.invalid"),
                ),
            ),
        )

    fun withMissingSegmentInUnalignedNucleotideSequences(
        accession: Accession = DefaultFiles.firstAccession,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences - segment,
            ),
        )

    fun withMissingSegmentInAlignedNucleotideSequences(
        accession: Accession = DefaultFiles.firstAccession,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences - segment,
            ),
        )

    fun withUnknownSegmentInAlignedNucleotideSequences(
        accession: Accession = DefaultFiles.firstAccession,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences + (segment to "NNNN"),
            ),
        )

    fun withUnknownSegmentInUnalignedNucleotideSequences(
        accession: Accession = DefaultFiles.firstAccession,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences + (segment to "NNNN"),
            ),
        )

    fun withUnknownSegmentInNucleotideInsertions(
        accession: Accession = DefaultFiles.firstAccession,
        segment: SegmentName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
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
        accession: Accession = DefaultFiles.firstAccession,
        segment: SegmentName,
        length: Int = 123,
    ): SubmittedProcessedData {
        val alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences.toMutableMap()
        alignedNucleotideSequences[segment] = "A".repeat(length)

        return defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(alignedNucleotideSequences = alignedNucleotideSequences),
        )
    }

    fun withAlignedNucleotideSequenceWithWrongSymbols(
        accession: Accession = DefaultFiles.firstAccession,
        segment: SegmentName,
    ): SubmittedProcessedData {
        val alignedNucleotideSequences = defaultProcessedData.alignedNucleotideSequences.toMutableMap()
        alignedNucleotideSequences[segment] = "ÄÖ" + alignedNucleotideSequences[segment]!!.substring(2)

        return defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(alignedNucleotideSequences = alignedNucleotideSequences),
        )
    }

    fun withUnalignedNucleotideSequenceWithWrongSymbols(
        accession: Accession = DefaultFiles.firstAccession,
        segment: SegmentName,
    ): SubmittedProcessedData {
        val unalignedNucleotideSequences = defaultProcessedData.unalignedNucleotideSequences.toMutableMap()
        unalignedNucleotideSequences[segment] = "ÄÖ" + unalignedNucleotideSequences[segment]!!.substring(2)

        return defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(unalignedNucleotideSequences = unalignedNucleotideSequences),
        )
    }

    fun withNucleotideInsertionsWithWrongSymbols(
        accession: Accession = DefaultFiles.firstAccession,
        segment: SegmentName,
    ): SubmittedProcessedData {
        val nucleotideInsertions = defaultProcessedData.nucleotideInsertions.toMutableMap()
        nucleotideInsertions[segment] = listOf(Insertion(123, "ÄÖ"))

        return defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(nucleotideInsertions = nucleotideInsertions),
        )
    }

    fun withMissingGeneInAminoAcidSequences(
        accession: Accession = DefaultFiles.firstAccession,
        gene: GeneName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                alignedAminoAcidSequences = defaultProcessedData.alignedAminoAcidSequences - gene,
            ),
        )

    fun withUnknownGeneInAminoAcidSequences(
        accession: Accession = DefaultFiles.firstAccession,
        gene: GeneName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(
                alignedAminoAcidSequences = defaultProcessedData.alignedAminoAcidSequences + (gene to "RNRNRN"),
            ),
        )

    fun withUnknownGeneInAminoAcidInsertions(
        accession: Accession = DefaultFiles.firstAccession,
        gene: GeneName,
    ) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
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
        accession: Accession = DefaultFiles.firstAccession,
        gene: SegmentName,
        length: Int = 123,
    ): SubmittedProcessedData {
        val aminoAcidSequences = defaultProcessedData.alignedAminoAcidSequences.toMutableMap()
        aminoAcidSequences[gene] = "A".repeat(length)

        return defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(alignedAminoAcidSequences = aminoAcidSequences),
        )
    }

    fun withAminoAcidSequenceWithWrongSymbols(
        accession: Accession = DefaultFiles.firstAccession,
        gene: SegmentName,
    ): SubmittedProcessedData {
        val aminoAcidSequence = defaultProcessedData.alignedAminoAcidSequences.toMutableMap()
        aminoAcidSequence[gene] = "ÄÖ" + aminoAcidSequence[gene]!!.substring(2)

        return defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(alignedAminoAcidSequences = aminoAcidSequence),
        )
    }

    fun withAminoAcidInsertionsWithWrongSymbols(
        accession: Accession = DefaultFiles.firstAccession,
        gene: SegmentName,
    ): SubmittedProcessedData {
        val aminoAcidInsertions = defaultProcessedData.aminoAcidInsertions.toMutableMap()
        aminoAcidInsertions[gene] = listOf(Insertion(123, "ÄÖ"))

        return defaultSuccessfulSubmittedData.withValues(
            accession = accession,
            data = defaultProcessedData.withValues(aminoAcidInsertions = aminoAcidInsertions),
        )
    }

    fun withErrors(accession: Accession = DefaultFiles.firstAccession) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
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

    fun withWarnings(accession: Accession = DefaultFiles.firstAccession) =
        defaultSuccessfulSubmittedData.withValues(
            accession = accession,
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
    accession: Accession? = null,
    version: Long? = null,
    data: ProcessedData? = null,
    errors: List<PreprocessingAnnotation>? = null,
    warnings: List<PreprocessingAnnotation>? = null,
) = SubmittedProcessedData(
    accession = accession ?: this.accession,
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
