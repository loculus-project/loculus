package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.NullNode
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.Insertion
import org.loculus.backend.api.MetadataMap
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BaseMetadata
import org.loculus.backend.config.MetadataType
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.config.Schema
import org.loculus.backend.controller.ProcessingValidationException
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

private const val DATE_FORMAT = "yyyy-MM-dd"

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

enum class AlignedNucleotideSymbols(override val symbol: Char) : Symbol {
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
}

private fun <T> validateNoUnknownInMetaData(data: Map<String, T>, known: List<String>) {
    val unknownMetadataKeys = data.keys.subtract(known.toSet())
    if (unknownMetadataKeys.isNotEmpty()) {
        val unknownMetadataKeysString = unknownMetadataKeys.sorted().joinToString(", ")
        throw ProcessingValidationException("Unknown fields in metadata: $unknownMetadataKeysString.")
    }
}

private fun validateKnownMetadataField(metadata: BaseMetadata, processedMetadataMap: MetadataMap): MetadataMap {
    val fieldName = metadata.name
    val fieldValue = processedMetadataMap[fieldName]

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
        return processedMetadataMap
    }

    return processedMetadataMap + (fieldName to NullNode.instance)
}

private fun validateType(fieldValue: JsonNode, metadata: BaseMetadata) {
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

        else -> {}
    }

    val isOfCorrectPrimitiveType = when (metadata.type) {
        MetadataType.STRING, MetadataType.AUTHORS -> fieldValue.isTextual
        MetadataType.INTEGER -> fieldValue.isInt
        MetadataType.FLOAT -> fieldValue.isFloatingPointNumber
        MetadataType.NUMBER -> fieldValue.isNumber
        MetadataType.BOOLEAN -> fieldValue.isBoolean
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

@Component
class ExternalMetadataValidatorFactory(private val backendConfig: BackendConfig) {
    fun create(organism: Organism): ExternalMetadataValidator {
        val instanceConfig = backendConfig.organisms[organism.name]!!
        return ExternalMetadataValidator(instanceConfig.schema)
    }
}

class ExternalMetadataValidator(private val schema: Schema) {
    fun validate(externalMetadata: MetadataMap, externalMetadataUpdater: String): MetadataMap {
        val metadataFields = schema.externalMetadata.filter { it.externalMetadataUpdater == externalMetadataUpdater }
        var processedMetadataMap = externalMetadata
        validateNoUnknownInMetaData(processedMetadataMap, metadataFields.map { it.name })

        for (metadata in metadataFields) {
            processedMetadataMap = validateKnownMetadataField(metadata, processedMetadataMap)
        }
        return processedMetadataMap
    }
}

@Component
class ProcessedSequenceEntryValidatorFactory(private val backendConfig: BackendConfig) {
    fun create(organism: Organism): ProcessedSequenceEntryValidator {
        val instanceConfig = backendConfig.organisms[organism.name]!!
        return ProcessedSequenceEntryValidator(
            schema = instanceConfig.schema,
            referenceGenome = instanceConfig.referenceGenome,
        )
    }
}

class ProcessedSequenceEntryValidator(private val schema: Schema, private val referenceGenome: ReferenceGenome) {
    fun validate(processedData: ProcessedData<GeneticSequence>): ProcessedData<GeneticSequence> {
        val processedDataWithAllMetadataFields = validateMetadata(processedData)
        validateNucleotideSequences(processedDataWithAllMetadataFields)
        val updatedProcessedDataWithAllMetadataFields =
            addMissingNucleotideSequences(processedDataWithAllMetadataFields)
        validateAminoAcidSequences(updatedProcessedDataWithAllMetadataFields)

        return addMissingKeysForInsertions(updatedProcessedDataWithAllMetadataFields)
    }

    private fun validateMetadata(processedData: ProcessedData<GeneticSequence>): ProcessedData<GeneticSequence> {
        val metadataFields = schema.metadata
        var processedMetadataMap = processedData.metadata
        validateNoUnknownInMetaData(processedMetadataMap, metadataFields.map { it.name })

        for (metadata in metadataFields) {
            processedMetadataMap = validateKnownMetadataField(metadata, processedMetadataMap)
        }
        return processedData.copy(metadata = processedMetadataMap)
    }

    private fun validateNucleotideSequences(processedData: ProcessedData<GeneticSequence>) {
        for (segment in referenceGenome.nucleotideSequences) {
            validateLengthOfSequence(
                segment,
                processedData.alignedNucleotideSequences,
                "alignedNucleotideSequences",
            )
        }

        validateNoUnknownSegment(
            processedData.alignedNucleotideSequences,
            "alignedNucleotideSequences",
        )

        validateNoUnknownSegment(
            processedData.unalignedNucleotideSequences,
            "unalignedNucleotideSequences",
        )

        validateNoUnknownSegment(
            processedData.nucleotideInsertions,
            "nucleotideInsertions",
        )

        validateNoUnknownNucleotideSymbol<AlignedNucleotideSymbols>(
            processedData.alignedNucleotideSequences,
            "alignedNucleotideSequences",
        )

        validateNoUnknownNucleotideSymbol<NucleotideSymbols>(
            processedData.unalignedNucleotideSequences,
            "unalignedNucleotideSequences",
        )

        validateNoUnknownNucleotideSymbolInInsertion(
            processedData.nucleotideInsertions,
        )
    }

    // TODO: remove this method
    private fun addMissingNucleotideSequences(
        processedData: ProcessedData<GeneticSequence>,
    ): ProcessedData<GeneticSequence> {
        val updatedAligned = referenceGenome.nucleotideSequences.associate { segment ->
            segment.name to (processedData.alignedNucleotideSequences[segment.name])
        }

        val updatedUnaligned = referenceGenome.nucleotideSequences.associate { segment ->
            segment.name to (processedData.unalignedNucleotideSequences[segment.name])
        }

        return processedData.copy(
            alignedNucleotideSequences = updatedAligned,
            unalignedNucleotideSequences = updatedUnaligned,
        )
    }

    private fun validateLengthOfSequence(
        referenceSequence: ReferenceSequence,
        sequenceData: Map<String, String?>,
        sequenceGrouping: String,
    ) {
        val sequence = sequenceData[referenceSequence.name] ?: return
        if (sequence.length != referenceSequence.sequence.length) {
            throw ProcessingValidationException(
                "The length of '${referenceSequence.name}' in '$sequenceGrouping' is ${sequence.length}, " +
                    "but it should be ${referenceSequence.sequence.length}.",
            )
        }
    }

    private fun validateNoUnknownSegment(dataToValidate: Map<String, *>, sequenceGrouping: String) {
        val unknownSegments = dataToValidate.keys.subtract(referenceGenome.nucleotideSequences.map { it.name }.toSet())
        if (unknownSegments.isNotEmpty()) {
            val unknownSegmentsString = unknownSegments.sorted().joinToString(", ")
            throw ProcessingValidationException(
                "Unknown segments in '$sequenceGrouping': $unknownSegmentsString.",
            )
        }
    }

    private inline fun <reified ValidSymbols> validateNoUnknownNucleotideSymbol(
        dataToValidate: Map<String, GeneticSequence?>,
        sequenceGrouping: String,
    ) where ValidSymbols : Enum<ValidSymbols>, ValidSymbols : Symbol {
        for ((segmentName, sequence) in dataToValidate) {
            if (sequence == null) {
                continue
            }
            val invalidSymbols = sequence.getInvalidSymbols<ValidSymbols>()
            if (invalidSymbols.isNotEmpty()) {
                throw ProcessingValidationException(
                    "The sequence of segment '$segmentName' in '$sequenceGrouping' " +
                        "contains invalid symbols: ${invalidSymbols.displayFirstCoupleSymbols()}.",
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
                            "contains invalid symbols: ${invalidSymbols.displayFirstCoupleSymbols()}.",
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

    private fun validateAminoAcidSequences(processedData: ProcessedData<GeneticSequence>) {
        for (gene in referenceGenome.genes) {
            validateNoMissingGene(gene, processedData)
            validateLengthOfSequence(
                gene,
                processedData.alignedAminoAcidSequences,
                "alignedAminoAcidSequences",
            )
        }

        validateNoUnknownGeneInData(
            processedData.alignedAminoAcidSequences,
            "alignedAminoAcidSequences",
        )

        validateNoUnknownGeneInData(
            processedData.aminoAcidInsertions,
            "aminoAcidInsertions",
        )

        validateNoUnknownAminoAcidSymbol(processedData.alignedAminoAcidSequences)
        validateNoUnknownAminoAcidSymbolInInsertion(processedData.aminoAcidInsertions)
    }
    // TODO: remove this method, add aligned amino acid sequences when streaming
    private fun validateNoMissingGene(gene: ReferenceSequence, processedData: ProcessedData<GeneticSequence>) {
        if (!processedData.alignedAminoAcidSequences.containsKey(gene.name)) {
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

    private fun validateNoUnknownAminoAcidSymbol(dataToValidate: Map<String, GeneticSequence?>) {
        for ((gene, sequence) in dataToValidate) {
            if (sequence == null) {
                continue
            }
            val invalidSymbols = sequence.getInvalidSymbols<AminoAcidSymbols>()
            if (invalidSymbols.isNotEmpty()) {
                throw ProcessingValidationException(
                    "The gene '$gene' in 'alignedAminoAcidSequences' " +
                        "contains invalid symbols: ${invalidSymbols.displayFirstCoupleSymbols()}.",
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
                            "contains invalid symbols: ${invalidSymbols.displayFirstCoupleSymbols()}.",
                    )
                }
            }
        }
    }
    //TODO: remove this method, add insertions when streaming
    private fun addMissingKeysForInsertions(
        processedData: ProcessedData<GeneticSequence>,
    ): ProcessedData<GeneticSequence> {
        val nucleotideInsertions = referenceGenome.nucleotideSequences.associate {
            if (it.name in processedData.nucleotideInsertions.keys) {
                it.name to processedData.nucleotideInsertions[it.name]!!
            } else {
                (it.name to emptyList())
            }
        }

        val aminoAcidInsertions = referenceGenome.genes.associate {
            if (it.name in processedData.aminoAcidInsertions.keys) {
                it.name to processedData.aminoAcidInsertions[it.name]!!
            } else {
                (it.name to emptyList())
            }
        }

        return processedData.copy(
            nucleotideInsertions = nucleotideInsertions,
            aminoAcidInsertions = aminoAcidInsertions,
        )
    }
}

private fun List<Char>.displayFirstCoupleSymbols() = this.map { it.toString() }
    .let {
        when {
            it.size > 10 -> it.take(10) + "..."
            else -> it
        }
    }
    .joinToString(separator = ", ", prefix = "[", postfix = "]")
