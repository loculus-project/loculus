package org.pathoplexus.backend.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.NullNode
import org.pathoplexus.backend.config.Gene
import org.pathoplexus.backend.config.GenomeSegment
import org.pathoplexus.backend.config.ReferenceGenome
import org.pathoplexus.backend.controller.ProcessingException
import org.pathoplexus.backend.model.Metadata
import org.pathoplexus.backend.model.SchemaConfig
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

private const val DATE_FORMAT = "yyyy-MM-dd"
private const val PANGO_LINEAGE_REGEX_PATTERN = "[a-zA-Z]{1,3}(\\.\\d{1,3}){0,3}"
private val pangoLineageRegex = Regex(PANGO_LINEAGE_REGEX_PATTERN)

enum class AminoAcidSymbols {
    A, C, D, E, F, G, H, I, K, L, M, N, P, Q, R, S, T, V, W, Y,
}

enum class AmbiguousAminoAcidSymbols {
    B, Z, X,
}

enum class NucleotideSymbols {
    A, C, G, T,
}

enum class AmbiguousNucleotideSymbols {
    M, R, W, S, Y, K, V, H, D, B, N,
}

@Component
class SequenceValidatorService(
    private val schemaConfig: SchemaConfig,
    private val referenceGenome: ReferenceGenome,
) {
    fun validateSequence(submittedProcessedData: SubmittedProcessedData) {
        validateMetadata(submittedProcessedData)
        validateNucleotideSequences(submittedProcessedData)
        validateAminoAcidSequences(submittedProcessedData)
    }

    private fun validateMetadata(
        submittedProcessedData: SubmittedProcessedData,
    ) {
        val metadataFields = schemaConfig.schema.metadata
        validateNoUnknownInMetaData(submittedProcessedData.data.metadata, metadataFields.map { it.name })

        for (metadata in metadataFields) {
            validateKnownMetadataField(metadata, submittedProcessedData)
        }
    }

    private fun <T> validateNoUnknownInMetaData(
        data: Map<String, T>,
        known: List<String>,
    ) {
        val unknowns = data.keys.subtract(known.toSet())
        for (unknown in unknowns) {
            throw ProcessingException("Unknown field '$unknown' in processed data.")
        }
    }

    private fun validateKnownMetadataField(
        metadata: Metadata,
        submittedProcessedData: SubmittedProcessedData,
    ) {
        val fieldName = metadata.name
        val fieldValue = submittedProcessedData.data.metadata[fieldName]

        if (metadata.required) {
            if (fieldValue == null) {
                throw ProcessingException("Missing the required field '$fieldName'.")
            }

            if (fieldValue is NullNode) {
                throw ProcessingException("Field '$fieldName' is null, but a value is required.")
            }
        }

        if (fieldValue != null) {
            validateType(fieldValue, metadata)
        }
    }

    fun validateType(fieldValue: JsonNode, metadata: Metadata) {
        if (fieldValue.isNull) {
            return
        }

        when (metadata.type) {
            "date" -> {
                if (!isValidDate(fieldValue.asText())) {
                    throw ProcessingException(
                        "Expected type 'date' in format '$DATE_FORMAT' for field '${metadata.name}', " +
                            "found value '$fieldValue'.",
                    )
                }
                return
            }

            "pango_lineage" -> {
                if (!isValidPangoLineage(fieldValue.asText())) {
                    throw ProcessingException(
                        "Expected type 'pango_lineage' for field '${metadata.name}', " +
                            "found value '$fieldValue'. " +
                            "A pango lineage must be of the form $PANGO_LINEAGE_REGEX_PATTERN, e.g. 'XBB' or 'BA.1.5'.",
                    )
                }
                return
            }
        }

        val isOfCorrectPrimitiveType = when (metadata.type) {
            "string" -> fieldValue.isTextual
            "integer" -> fieldValue.isInt
            "float" -> fieldValue.isFloat
            "double" -> fieldValue.isDouble
            "number" -> fieldValue.isNumber
            else -> false
        }

        if (!isOfCorrectPrimitiveType) {
            throw ProcessingException(
                "Expected type '${metadata.type}' for field '${metadata.name}', " +
                    "found value '$fieldValue'.",
            )
        }
    }

    fun isValidDate(dateStringCandidate: String): Boolean {
        val formatter = DateTimeFormatter.ofPattern(DATE_FORMAT)
        return try {
            LocalDate.parse(dateStringCandidate, formatter)
            true
        } catch (e: DateTimeParseException) {
            false
        }
    }

    fun isValidPangoLineage(pangoLineageCandidate: String): Boolean {
        return pangoLineageCandidate.matches(pangoLineageRegex)
    }

    private fun validateNucleotideSequences(
        submittedProcessedData: SubmittedProcessedData,
    ) {
        for (segment in referenceGenome.segments) {
            validateNoMissingSegment(
                segment,
                submittedProcessedData.data.alignedNucleotideSequences,
                "alignedNucleotideSequences",
            )
            validateLengthOfSegment(
                segment,
                submittedProcessedData.data.alignedNucleotideSequences,
                "alignedNucleotideSequences",
            )

            validateNoMissingSegment(
                segment,
                submittedProcessedData.data.unalignedNucleotideSequences,
                "unalignedNucleotideSequences",
            )
        }

        validateNoUnknownSegment(
            submittedProcessedData.data.alignedNucleotideSequences,
            "alignedNucleotideSequences",
        )

        validateNoUnknownSegment(
            submittedProcessedData.data.unalignedNucleotideSequences,
            "unalignedNucleotideSequences",
        )

        validateNoUnknownSegment(
            submittedProcessedData.data.nucleotideInsertions,
            "nucleotideInsertions",
        )

        validateNoUnknownNucleotideSymbol(
            submittedProcessedData.data.alignedNucleotideSequences,
            "alignedNucleotideSequences",
        )

        validateNoUnknownNucleotideSymbol(
            submittedProcessedData.data.unalignedNucleotideSequences,
            "unalignedNucleotideSequences",
        )

        validateNoUnknownNucleotideSymbolInInsertion(
            submittedProcessedData.data.nucleotideInsertions,
            "nucleotideInsertions",
        )
    }

    private fun <T> validateNoMissingSegment(
        segment: GenomeSegment,
        sequenceData: Map<String, T>,
        sequence: String,
    ) {
        // TODO: update this when we have multiple segments and add tests
        if (sequenceData.size > 1) {
            throw NotImplementedError("Currently we only have single segmented sequences")
        }
        if (!sequenceData.containsKey(segment.name)) {
            throw ProcessingException("Missing the required segment '${segment.name}' in '$sequence'.")
        }
    }

    private fun validateLengthOfSegment(
        segment: GenomeSegment,
        sequenceData: Map<String, String>,
        sequenceGrouping: String,
    ) {
        val sequence = sequenceData[segment.name]!!
        if (sequence.length != segment.sequence.length) {
            throw ProcessingException(
                "The length of segment '${segment.name}' in '$sequenceGrouping' is ${sequence.length}, but it should" +
                    " be ${segment.sequence.length}.",
            )
        }
    }

    private fun <T> validateNoUnknownSegment(
        dataToValidate: Map<String, T>,
        sequenceGrouping: String,
    ) {
        val unknowns = dataToValidate.keys.subtract(referenceGenome.segments.map { it.name }.toSet())
        for (unknown in unknowns) {
            throw ProcessingException("Unknown segment '$unknown' in '$sequenceGrouping'.")
        }
    }

    private fun validateNoUnknownNucleotideSymbol(
        dataToValidate: Map<String, String>,
        sequenceGrouping: String,
    ) {
        for (sequence in dataToValidate) {
            val invalidSymbols = sequence.value.invalidNucleotideSymbols()
            if (invalidSymbols.isNotEmpty()) {
                throw ProcessingException(
                    "The sequence of segment '${sequence.key}' in '$sequenceGrouping' " +
                        "contains invalid symbols: $invalidSymbols.",
                )
            }
        }
    }

    private fun validateNoUnknownNucleotideSymbolInInsertion(
        dataToValidate: Map<String, List<Insertion>>,
        sequenceGrouping: String,
    ) {
        for (sequence in dataToValidate) {
            for (insertion in sequence.value) {
                val invalidSymbols = insertion.sequence.invalidNucleotideSymbols()
                if (invalidSymbols.isNotEmpty()) {
                    throw ProcessingException(
                        "An insertion of segment '${sequence.key}' in '$sequenceGrouping' " +
                            "contains invalid symbols: $invalidSymbols.",
                    )
                }
            }
        }
    }

    fun String.invalidNucleotideSymbols(): List<Char> {
        return this.filter { !it.isValidNucleotideSymbol() }.toList()
    }

    fun Char.isValidNucleotideSymbol(): Boolean {
        return when (this) {
            in NucleotideSymbols.entries.map { it.name[0] } -> true
            in AmbiguousNucleotideSymbols.entries.map { it.name[0] } -> true
            else -> false
        }
    }

    private fun validateAminoAcidSequences(
        submittedProcessedData: SubmittedProcessedData,
    ) {
        for (gene in referenceGenome.genes) {
            validateNoMissingGene(gene, submittedProcessedData)
            validateLengthOfGene(gene, submittedProcessedData.data.aminoAcidSequences)
        }

        validateNoUnknownGeneInData(
            submittedProcessedData.data.aminoAcidSequences,
            "aminoAcidSequences",
        )

        validateNoUnknownGeneInData(
            submittedProcessedData.data.aminoAcidInsertions,
            "aminoAcidInsertions",
        )

        validateNoUnknownAminoAcidSymbol(
            submittedProcessedData.data.aminoAcidSequences,
            "aminoAcidSequences",
        )
        validateNoUnknownAminoAcidSymbolInInsertion(
            submittedProcessedData.data.aminoAcidInsertions,
            "aminoAcidInsertions",
        )
    }

    private fun validateLengthOfGene(
        gene: Gene,
        sequenceData: Map<String, String>,
    ) {
        val sequence = sequenceData[gene.name]!!
        if (sequence.length != gene.sequence.length) {
            throw ProcessingException(
                "The length of gene '${gene.name}' is ${sequence.length}, but it should be " +
                    "${gene.sequence.length}.",
            )
        }
    }

    private fun validateNoMissingGene(
        gene: Gene,
        submittedProcessedData: SubmittedProcessedData,
    ) {
        if (!submittedProcessedData.data.aminoAcidSequences.containsKey(gene.name)) {
            throw ProcessingException("Missing the required gene '${gene.name}'.")
        }
    }

    private fun <T> validateNoUnknownGeneInData(
        data: Map<String, T>,
        geneGrouping: String,
    ) {
        val unknowns = data.keys.subtract(referenceGenome.genes.map { it.name }.toSet())
        for (unknown in unknowns) {
            throw ProcessingException("Unknown gene '$unknown' in '$geneGrouping'.")
        }
    }

    private fun validateNoUnknownAminoAcidSymbol(
        dataToValidate: Map<String, String>,
        sequenceGrouping: String,
    ) {
        for (sequence in dataToValidate) {
            val invalidSymbols = sequence.value.invalidAminoAcidSymbols()
            if (invalidSymbols.isNotEmpty()) {
                throw ProcessingException(
                    "The gene '${sequence.key}' in '$sequenceGrouping' " +
                        "contains invalid symbols: $invalidSymbols.",
                )
            }
        }
    }

    private fun validateNoUnknownAminoAcidSymbolInInsertion(
        dataToValidate: Map<String, List<Insertion>>,
        sequenceGrouping: String,
    ) {
        for (sequence in dataToValidate) {
            for (insertion in sequence.value) {
                val invalidSymbols = insertion.sequence.invalidAminoAcidSymbols()
                if (invalidSymbols.isNotEmpty()) {
                    throw ProcessingException(
                        "An insertion of gene '${sequence.key}' in '$sequenceGrouping' " +
                            "contains invalid symbols: $invalidSymbols.",
                    )
                }
            }
        }
    }

    fun String.invalidAminoAcidSymbols(): List<Char> {
        return this.filter { !it.isValidAminoAcidSymbol() }.toList()
    }

    fun Char.isValidAminoAcidSymbol(): Boolean {
        return when (this) {
            in AminoAcidSymbols.entries.map { it.name[0] } -> true
            in AmbiguousAminoAcidSymbols.entries.map { it.name[0] } -> true
            else -> false
        }
    }
}
