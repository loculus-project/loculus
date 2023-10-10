package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.DoubleNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.service.PreprocessingAnnotation
import org.pathoplexus.backend.service.PreprocessingAnnotationSource
import org.pathoplexus.backend.service.PreprocessingAnnotationSourceType
import org.pathoplexus.backend.service.ProcessedData
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
        "main" to "NNNNNN",
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
    unalignedNucleotideSequences: Map<String, String>? = null,
) = ProcessedData(
    metadata = metadata ?: this.metadata,
    unalignedNucleotideSequences = unalignedNucleotideSequences ?: this.unalignedNucleotideSequences,
)
