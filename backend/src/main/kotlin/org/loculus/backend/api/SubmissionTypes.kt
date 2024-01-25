package org.loculus.backend.api

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonValue
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationContext
import com.fasterxml.jackson.databind.JsonDeserializer
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.annotation.JsonDeserialize
import io.swagger.v3.oas.annotations.media.Schema
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.Version

interface AccessionVersionInterface {
    val accession: Accession
    val version: Version

    fun displayAccessionVersion() = "$accession.$version"
}

data class AccessionVersion(
    override val accession: Accession,
    override val version: Version,
) : AccessionVersionInterface

data class SubmissionIdMapping(
    override val accession: Accession,
    override val version: Version,
    val submissionId: String,
) : AccessionVersionInterface

fun <T : AccessionVersionInterface> List<T>.toPairs() = map { Pair(it.accession, it.version) }

data class SubmittedProcessedData(
    override val accession: Accession,
    override val version: Version,
    val data: ProcessedData,
    @Schema(description = "The processing failed due to these errors.")
    val errors: List<PreprocessingAnnotation>? = null,
    @Schema(
        description =
        "Issues where data is not necessarily wrong, but the submitter might want to look into those warnings.",
    )
    val warnings: List<PreprocessingAnnotation>? = null,
) : AccessionVersionInterface

data class SequenceEntryVersionToEdit(
    override val accession: Accession,
    override val version: Version,
    val status: Status,
    val processedData: ProcessedData,
    val originalData: OriginalData,
    @Schema(description = "The preprocessing will be considered failed if this is not empty")
    val errors: List<PreprocessingAnnotation>? = null,
    @Schema(
        description =
        "Issues where data is not necessarily wrong, but the user might want to look into those warnings.",
    )
    val warnings: List<PreprocessingAnnotation>? = null,
) : AccessionVersionInterface

typealias SegmentName = String
typealias GeneName = String
typealias NucleotideSequence = String
typealias AminoAcidSequence = String

data class ProcessedData(
    @Schema(
        example = """{"date": "2020-01-01", "country": "Germany", "age": 42, "qc": 0.95}""",
        description = "Key value pairs of metadata, correctly typed",
    )
    val metadata: Map<String, JsonNode>,
    @Schema(
        example = """{"segment1": "ACTG", "segment2": "GTCA"}""",
        description = "The key is the segment name, the value is the nucleotide sequence",
    )
    val unalignedNucleotideSequences: Map<SegmentName, NucleotideSequence>,
    @Schema(
        example = """{"segment1": "ACTG", "segment2": "GTCA"}""",
        description = "The key is the segment name, the value is the aligned nucleotide sequence",
    )
    val alignedNucleotideSequences: Map<SegmentName, NucleotideSequence>,
    @Schema(
        example = """{"segment1": ["123:GTCA", "345:AAAA"], "segment2": ["123:GTCA", "345:AAAA"]}""",
        description = "The key is the segment name, the value is a list of nucleotide insertions",
    )
    val nucleotideInsertions: Map<SegmentName, List<Insertion>>,
    @Schema(
        example = """{"gene1": "NRNR", "gene2": "NRNR"}""",
        description = "The key is the gene name, the value is the amino acid sequence",
    )
    val alignedAminoAcidSequences: Map<GeneName, AminoAcidSequence>,
    @Schema(
        example = """{"gene1": ["123:RRN", "345:NNN"], "gene2": ["123:NNR", "345:RN"]}""",
        description = "The key is the gene name, the value is a list of amino acid insertions",
    )
    val aminoAcidInsertions: Map<GeneName, List<Insertion>>,
)

@JsonDeserialize(using = InsertionDeserializer::class)
data class Insertion(
    @Schema(example = "123", description = "Position in the sequence where the insertion starts")
    val position: Int,
    @Schema(example = "GTCA", description = "Inserted sequence")
    val sequence: String,
) {
    companion object {
        fun fromString(insertionString: String): Insertion {
            val parts = insertionString.split(":")
            if (parts.size != 2) {
                throw IllegalArgumentException("Invalid insertion string: $insertionString")
            }
            return Insertion(parts[0].toInt(), parts[1])
        }
    }

    @JsonValue
    override fun toString(): String {
        return "$position:$sequence"
    }
}

class InsertionDeserializer : JsonDeserializer<Insertion>() {
    override fun deserialize(p: JsonParser, ctxt: DeserializationContext): Insertion {
        return Insertion.fromString(p.valueAsString)
    }
}

data class PreprocessingAnnotation(
    val source: List<PreprocessingAnnotationSource>,
    @Schema(description = "A descriptive message that helps the submitter to fix the issue") val message: String,
)

data class PreprocessingAnnotationSource(
    val type: PreprocessingAnnotationSourceType,
    @Schema(description = "Field or sequence segment name") val name: String,
)

enum class PreprocessingAnnotationSourceType {
    Metadata,
    NucleotideSequence,
}

data class SequenceEntryStatus(
    override val accession: Accession,
    override val version: Version,
    val status: Status,
    val isRevocation: Boolean = false,
) : AccessionVersionInterface

data class RevisedData(
    val submissionId: String,
    val accession: Accession,
    val originalData: OriginalData,
)

data class UnprocessedData(
    @Schema(example = "123") override val accession: Accession,
    @Schema(example = "1") override val version: Version,
    val data: OriginalData,
) : AccessionVersionInterface

data class OriginalData(
    @Schema(
        example = "{\"date\": \"2020-01-01\", \"country\": \"Germany\"}",
        description = "Key value pairs of metadata, as submitted in the metadata file",
    )
    val metadata: Map<String, String>,
    @Schema(
        example = "{\"segment1\": \"ACTG\", \"segment2\": \"GTCA\"}",
        description = "The key is the segment name, the value is the nucleotide sequence",
    )
    val unalignedNucleotideSequences: Map<SegmentName, NucleotideSequence>,
)

enum class Status {
    @JsonProperty("RECEIVED")
    RECEIVED,

    @JsonProperty("IN_PROCESSING")
    IN_PROCESSING,

    @JsonProperty("HAS_ERRORS")
    HAS_ERRORS,

    @JsonProperty("AWAITING_APPROVAL")
    AWAITING_APPROVAL,

    @JsonProperty("APPROVED_FOR_RELEASE")
    APPROVED_FOR_RELEASE,

    @JsonProperty("AWAITING_APPROVAL_FOR_REVOCATION")
    AWAITING_APPROVAL_FOR_REVOCATION,

    ;

    companion object {
        private val stringToEnumMap: Map<String, Status> = entries.associateBy { it.name }

        fun fromString(statusString: String): Status {
            return stringToEnumMap[statusString]
                ?: throw IllegalArgumentException("Unknown status: $statusString")
        }
    }
}

enum class SiloVersionStatus {
    REVOKED,
    REVISED,
    LATEST_VERSION,
}
