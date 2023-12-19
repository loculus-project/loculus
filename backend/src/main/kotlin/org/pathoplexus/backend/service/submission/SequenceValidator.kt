package org.pathoplexus.backend.service.submission

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.NullNode
import org.pathoplexus.backend.api.Insertion
import org.pathoplexus.backend.api.Organism
import org.pathoplexus.backend.api.SubmittedProcessedData
import org.pathoplexus.backend.config.BackendConfig
import org.pathoplexus.backend.config.Metadata
import org.pathoplexus.backend.config.MetadataType
import org.pathoplexus.backend.config.ReferenceGenome
import org.pathoplexus.backend.config.ReferenceSequence
import org.pathoplexus.backend.config.Schema
import org.pathoplexus.backend.controller.ProcessingValidationException
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

private const val DATE_FORMAT = "yyyy-MM-dd"
private const val PANGO_LINEAGE_REGEX_PATTERN = "[a-zA-Z]{1,3}(\\.\\d{1,3}){0,3}"
private val pangoLineageRegex = Regex(PANGO_LINEAGE_REGEX_PATTERN)

interface Symbol {
    val symbol: Char
}

enum class AminoAcidSymbols(override val symbol: Char) : Symbol {
    A('A'),
    C('C'),
    D('D'),
    E('E'),
    F('F'),
    G('G'),
    H('H'),
    I('I'),
    K('K'),
    L('L'),
    M('M'),
    N('N'),
    P('P'),
    Q('Q'),
    R('R'),
    S('S'),
    T('T'),
    V('V'),
    W('W'),
    Y('Y'),
    B('B'),
    Z('Z'),
    X('X'),
    GAP('-'),
    STOP('*'),
}

enum class NucleotideSymbols(override val symbol: Char) : Symbol {
    A('A'),
    C('C'),
    G('G'),
    T('T'),
    M('M'),
    R('R'),
    W('W'),
    S('S'),
    Y('Y'),
    K('K'),
    V('V'),
    H('H'),
    D('D'),
    B('B'),
    N('N'),
    GAP('-'),
}

@Component
class SequenceValidatorFactory(private val backendConfig: BackendConfig) {
    fun create(organism: Organism): SequenceValidator {
        val instanceConfig = backendConfig.instances[organism.name]!!
        return SequenceValidator(instanceConfig.schema, instanceConfig.referenceGenomes)
    }
}

class SequenceValidator(
    private val schema: Schema,
    private val referenceGenome: ReferenceGenome,
) {
    fun validateSequence(submittedProcessedData: SubmittedProcessedData) {
        validateMetadata(submittedProcessedData)
        validateNucleotideSequences(submittedProcessedData)
        validateAminoAcidSequences(submittedProcessedData)
    }

    private fun validateMetadata(submittedProcessedData: SubmittedProcessedData) {
        val metadataFields = schema.metadata
        validateNoUnknownInMetaData(submittedProcessedData.data.metadata, metadataFields.map { it.name })

        for (metadata in metadataFields) {
            validateKnownMetadataField(metadata, submittedProcessedData)
        }
    }

    private fun <T> validateNoUnknownInMetaData(data: Map<String, T>, known: List<String>) {
        val unknownMetadataKeys = data.keys.subtract(known.toSet())
        if (unknownMetadataKeys.isNotEmpty()) {
            val unknownMetadataKeysString = unknownMetadataKeys.sorted().joinToString(", ")
            throw ProcessingValidationException("Unknown fields in processed data: $unknownMetadataKeysString.")
        }
    }

    private fun validateKnownMetadataField(metadata: Metadata, submittedProcessedData: SubmittedProcessedData) {
        val fieldName = metadata.name
        val fieldValue = submittedProcessedData.data.metadata[fieldName]

        if (metadata.required) {
            if (fieldValue == null) {
                throw ProcessingValidationException("Missing the required field '$fieldName'.")
            }

            if (fieldValue is NullNode) {
                throw ProcessingValidationException("Field '$fieldName' is null, but a value is required.")
            }
        }

        if (fieldValue != null) {
            validateType(fieldValue, metadata)
        }
    }

    private fun validateType(fieldValue: JsonNode, metadata: Metadata) {
        if (fieldValue.isNull) {
            return
        }

        when (metadata.type) {
            MetadataType.DATE -> {
                if (!isValidDate(fieldValue.asText())) {
                    throw ProcessingValidationException(
                        "Expected type 'date' in format '$DATE_FORMAT' for field '${metadata.name}', " +
                            "found value '$fieldValue'.",
                    )
                }
                return
            }

            MetadataType.PANGO_LINEAGE -> {
                if (!isValidPangoLineage(fieldValue.asText())) {
                    throw ProcessingValidationException(
                        "Expected type 'pango_lineage' for field '${metadata.name}', " +
                            "found value '$fieldValue'. " +
                            "A pango lineage must be of the form $PANGO_LINEAGE_REGEX_PATTERN, e.g. 'XBB' or 'BA.1.5'.",
                    )
                }
                return
            }

            else -> {}
        }

        val isOfCorrectPrimitiveType = when (metadata.type) {
            MetadataType.STRING -> fieldValue.isTextual
            MetadataType.INTEGER -> fieldValue.isInt
            MetadataType.FLOAT -> fieldValue.isFloat
            MetadataType.DOUBLE -> fieldValue.isDouble
            MetadataType.NUMBER -> fieldValue.isNumber
            else -> false
        }

        if (!isOfCorrectPrimitiveType) {
            throw ProcessingValidationException(
                "Expected type '${metadata.type}' for field '${metadata.name}', " +
                    "found value '$fieldValue'.",
            )
        }
    }

    private fun isValidDate(dateStringCandidate: String): Boolean {
        val formatter = DateTimeFormatter.ofPattern(DATE_FORMAT)
        return try {
            LocalDate.parse(dateStringCandidate, formatter)
            true
        } catch (e: DateTimeParseException) {
            false
        }
    }

    private fun isValidPangoLineage(pangoLineageCandidate: String): Boolean {
        return pangoLineageCandidate.matches(pangoLineageRegex)
    }

    private fun validateNucleotideSequences(submittedProcessedData: SubmittedProcessedData) {
        for (segment in referenceGenome.nucleotideSequences) {
            validateNoMissingSegment(
                segment,
                submittedProcessedData.data.alignedNucleotideSequences,
                "alignedNucleotideSequences",
            )
            validateLengthOfSequence(
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
        )
    }

    private fun <T> validateNoMissingSegment(
        segment: ReferenceSequence,
        sequenceData: Map<String, T>,
        sequence: String,
    ) {
        if (!sequenceData.containsKey(segment.name)) {
            throw ProcessingValidationException("Missing the required segment '${segment.name}' in '$sequence'.")
        }
    }

    private fun validateLengthOfSequence(
        referenceSequence: ReferenceSequence,
        sequenceData: Map<String, String>,
        sequenceGrouping: String,
    ) {
        val sequence = sequenceData[referenceSequence.name]!!
        if (sequence.length != referenceSequence.sequence.length) {
            throw ProcessingValidationException(
                "The length of '${referenceSequence.name}' in '$sequenceGrouping' is ${sequence.length}, " +
                    "but it should be ${referenceSequence.sequence.length}.",
            )
        }
    }

    private fun <T> validateNoUnknownSegment(dataToValidate: Map<String, T>, sequenceGrouping: String) {
        val unknownSegments = dataToValidate.keys.subtract(referenceGenome.nucleotideSequences.map { it.name }.toSet())
        if (unknownSegments.isNotEmpty()) {
            val unknownSegmentsString = unknownSegments.sorted().joinToString(", ")
            throw ProcessingValidationException(
                "Unknown segments in '$sequenceGrouping': $unknownSegmentsString.",
            )
        }
    }

    private fun validateNoUnknownNucleotideSymbol(dataToValidate: Map<String, String>, sequenceGrouping: String) {
        for (sequence in dataToValidate) {
            val invalidSymbols = sequence.value.getInvalidSymbols<NucleotideSymbols>()
            if (invalidSymbols.isNotEmpty()) {
                throw ProcessingValidationException(
                    "The sequence of segment '${sequence.key}' in '$sequenceGrouping' " +
                        "contains invalid symbols: $invalidSymbols.",
                )
            }
        }
    }

    private fun validateNoUnknownNucleotideSymbolInInsertion(dataToValidate: Map<String, List<Insertion>>) {
        for (sequence in dataToValidate) {
            for (insertion in sequence.value) {
                val invalidSymbols = insertion.sequence.getInvalidSymbols<NucleotideSymbols>()
                if (invalidSymbols.isNotEmpty()) {
                    throw ProcessingValidationException(
                        "The insertion $insertion of segment '${sequence.key}' in 'nucleotideInsertions' " +
                            "contains invalid symbols: $invalidSymbols.",
                    )
                }
            }
        }
    }

    private inline fun <reified ValidSymbols> String.getInvalidSymbols()
        where ValidSymbols : Enum<ValidSymbols>, ValidSymbols : Symbol =
        this.filter { !it.isValidSymbol<ValidSymbols>() }.toList()

    private inline fun <reified ValidSymbols> Char.isValidSymbol()
        where ValidSymbols : Enum<ValidSymbols>, ValidSymbols : Symbol =
        enumValues<ValidSymbols>().any { it.symbol == this }

    private fun validateAminoAcidSequences(submittedProcessedData: SubmittedProcessedData) {
        for (gene in referenceGenome.genes) {
            validateNoMissingGene(gene, submittedProcessedData)
            validateLengthOfSequence(
                gene,
                submittedProcessedData.data.alignedAminoAcidSequences,
                "alignedAminoAcidSequences",
            )
        }

        validateNoUnknownGeneInData(
            submittedProcessedData.data.alignedAminoAcidSequences,
            "alignedAminoAcidSequences",
        )

        validateNoUnknownGeneInData(
            submittedProcessedData.data.aminoAcidInsertions,
            "aminoAcidInsertions",
        )

        validateNoUnknownAminoAcidSymbol(submittedProcessedData.data.alignedAminoAcidSequences)
        validateNoUnknownAminoAcidSymbolInInsertion(submittedProcessedData.data.aminoAcidInsertions)
    }

    private fun validateNoMissingGene(gene: ReferenceSequence, submittedProcessedData: SubmittedProcessedData) {
        if (!submittedProcessedData.data.alignedAminoAcidSequences.containsKey(gene.name)) {
            throw ProcessingValidationException("Missing the required gene '${gene.name}'.")
        }
    }

    private fun validateNoUnknownGeneInData(data: Map<String, *>, geneGrouping: String) {
        val unknownGenes = data.keys.subtract(referenceGenome.genes.map { it.name }.toSet())
        if (unknownGenes.isNotEmpty()) {
            val unknownGenesString = unknownGenes.sorted().joinToString(", ")
            throw ProcessingValidationException("Unknown genes in '$geneGrouping': $unknownGenesString.")
        }
    }

    private fun validateNoUnknownAminoAcidSymbol(dataToValidate: Map<String, String>) {
        for (sequence in dataToValidate) {
            val invalidSymbols = sequence.value.getInvalidSymbols<AminoAcidSymbols>()
            if (invalidSymbols.isNotEmpty()) {
                throw ProcessingValidationException(
                    "The gene '${sequence.key}' in 'alignedAminoAcidSequences' " +
                        "contains invalid symbols: $invalidSymbols.",
                )
            }
        }
    }

    private fun validateNoUnknownAminoAcidSymbolInInsertion(dataToValidate: Map<String, List<Insertion>>) {
        for (sequence in dataToValidate) {
            for (insertion in sequence.value) {
                val invalidSymbols = insertion.sequence.getInvalidSymbols<AminoAcidSymbols>()
                if (invalidSymbols.isNotEmpty()) {
                    throw ProcessingValidationException(
                        "An insertion of gene '${sequence.key}' in 'aminoAcidInsertions' " +
                            "contains invalid symbols: $invalidSymbols.",
                    )
                }
            }
        }
    }
}
