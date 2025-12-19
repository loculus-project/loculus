package org.loculus.backend.api

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonValue
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationContext
import com.fasterxml.jackson.databind.JsonDeserializer
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.annotation.JsonDeserialize
import io.swagger.v3.oas.annotations.media.Schema
import org.loculus.backend.model.FastaId
import org.loculus.backend.model.SubmissionId
import org.loculus.backend.service.files.FileId
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.Version
import org.springframework.core.convert.converter.Converter
import org.springframework.stereotype.Component

data class Accessions(val accessions: List<Accession>)

interface AccessionVersionInterface {
    val accession: Accession
    val version: Version

    fun displayAccessionVersion() = "$accession.$version"
}

data class AccessionVersion(override val accession: Accession, override val version: Version) :
    AccessionVersionInterface

data class SubmissionIdMapping(
    override val accession: Accession,
    override val version: Version,
    val submissionId: String,
) : AccessionVersionInterface

fun <T : AccessionVersionInterface> List<T>.toPairs() = map { Pair(it.accession, it.version) }

enum class DeleteSequenceScope {
    ALL,
    PROCESSED_WITH_ERRORS,
    PROCESSED_WITH_WARNINGS,
}

const val ACCESSION_VERSIONS_FILTER_DESCRIPTION =
    "A List of accession versions that the operation will be restricted to. " +
        "Omit or set to null to consider all sequences."

data class AccessionVersionsFilterWithDeletionScope(
    @Schema(
        description = ACCESSION_VERSIONS_FILTER_DESCRIPTION,
    )
    val accessionVersionsFilter: List<AccessionVersion>? = null,
    val groupIdsFilter: List<Int>? = null,
    @Schema(
        description = "Scope for deletion. If scope is set to 'ALL', all sequences are deleted. " +
            "If scope is set to 'PROCESSED_WITH_ERRORS', only processed sequences with errors are deleted. " +
            "If scope is set to 'PROCESSED_WITH_WARNINGS', only processed sequences in `AWAITING_APPROVAL` " +
            "with warnings are deleted.",
    )
    val scope: DeleteSequenceScope,
)

data class AccessionsToRevokeWithComment(
    @Schema(
        description = "List of accessions to revoke.",
    )
    val accessions: List<Accession>,
    @Schema(
        description = "Reason for revocation or other details",
    )
    val versionComment: String? = null,
)

enum class ApproveDataScope {
    ALL,
    WITHOUT_WARNINGS,
}

data class AccessionVersionsFilterWithApprovalScope(
    @Schema(
        description = ACCESSION_VERSIONS_FILTER_DESCRIPTION,
    )
    val accessionVersionsFilter: List<AccessionVersion>? = null,
    val groupIdsFilter: List<Int>? = null,
    val submitterNamesFilter: List<String>? = null,
    @Schema(
        description = "Scope for approval. If scope is set to 'ALL', all sequences are approved. " +
            "If scope is set to 'WITHOUT_WARNINGS', only sequences without warnings are approved.",
    )
    val scope: ApproveDataScope,
)

data class SubmittedProcessedData(
    override val accession: Accession,
    override val version: Version,
    val data: ProcessedData<GeneticSequence>,
    @Schema(description = "The processing failed due to these errors.")
    val errors: List<PreprocessingAnnotation>? = null,
    @Schema(
        description =
        "Issues where data is not necessarily wrong, but the submitter might want to look into those warnings.",
    )
    val warnings: List<PreprocessingAnnotation>? = null,
) : AccessionVersionInterface {
    fun processingResult(): ProcessingResult {
        if (errors.orEmpty().isNotEmpty()) {
            return ProcessingResult.HAS_ERRORS
        } else if (warnings.orEmpty().isNotEmpty()) {
            return ProcessingResult.HAS_WARNINGS
        } else {
            return ProcessingResult.NO_ISSUES
        }
    }
}

data class SequenceEntryVersionToEdit(
    override val accession: Accession,
    override val version: Version,
    val status: Status,
    val groupId: Int,
    val processedData: ProcessedData<GeneticSequence>,
    val originalData: OriginalData<GeneticSequence>,
    @Schema(description = "The preprocessing will be considered failed if this is not empty")
    val errors: List<PreprocessingAnnotation>? = null,
    @Schema(
        description =
        "Issues where data is not necessarily wrong, but the user might want to look into those warnings.",
    )
    val warnings: List<PreprocessingAnnotation>? = null,
    val submissionId: String,
) : AccessionVersionInterface

typealias SegmentName = String
typealias GeneName = String
typealias GeneticSequence = String
typealias MetadataMap = Map<String, JsonNode>

data class ProcessedData<SequenceType>(
    @Schema(
        example = """{"date": "2020-01-01", "country": "Germany", "age": 42, "qc": 0.95}""",
        description = "Key value pairs of metadata, correctly typed",
    )
    val metadata: MetadataMap,
    @Schema(
        example = """{"segment1": "ACTG", "segment2": "GTCA"}""",
        description = "The key is the segment name, the value is the nucleotide sequence",
    )
    val unalignedNucleotideSequences: Map<SegmentName, SequenceType?>,
    @Schema(
        example = """{"segment1": "ACTG", "segment2": "GTCA"}""",
        description = "The key is the segment name, the value is the aligned nucleotide sequence",
    )
    val alignedNucleotideSequences: Map<SegmentName, SequenceType?>,
    @Schema(
        example = """{"segment1": ["123:GTCA", "345:AAAA"], "segment2": ["123:GTCA", "345:AAAA"]}""",
        description = "The key is the segment name, the value is a list of nucleotide insertions",
    )
    val nucleotideInsertions: Map<SegmentName, List<Insertion>>,
    @Schema(
        example = """{"gene1": "NRNR", "gene2": "NRNR"}""",
        description = "The key is the gene name, the value is the amino acid sequence",
    )
    val alignedAminoAcidSequences: Map<GeneName, SequenceType?>,
    @Schema(
        example = """{"gene1": ["123:RRN", "345:NNN"], "gene2": ["123:NNR", "345:RN"]}""",
        description = "The key is the gene name, the value is a list of amino acid insertions",
    )
    val aminoAcidInsertions: Map<GeneName, List<Insertion>>,
    @Schema(
        example = """{"segment1": "fastaHeader1", "segment2": "fastaHeader2"}""",
        description = "The key is the segment name, the value is the fastaHeader of the original Data",
    )
    val sequenceNameToFastaId: Map<SegmentName, String> = emptyMap(),
    @Schema(
        example = """{"raw_reads": [{"fileId": "s0m3-uUiDd", "name": "data.fastaq"}], "sequencing_logs": []}""",
        description = "The key is the file category name, the value is a list of files, with ID and name.",
    )
    val files: FileCategoryFilesMap?,
)

data class ReleasedData(
    @Schema(
        example = """{"date": "2020-01-01", "country": "Germany", "age": 42, "qc": 0.95}""",
        description = "Key value pairs of metadata, correctly typed",
    )
    val metadata: MetadataMap,
    @Schema(
        example = """{"segment1": "ACTG", "segment2": "GTCA"}""",
        description = "The key is the segment name, the value is the nucleotide sequence",
    )
    val unalignedNucleotideSequences: Map<SegmentName, GeneticSequence?>,
    @Schema(
        example = """{"segment1": "ACTG", "segment2": "GTCA"}""",
        description = "The key is the segment name, the value is the aligned nucleotide sequence",
    )
    val alignedNucleotideSequences: Map<SegmentName, GeneticSequence?>,
    @Schema(
        example = """{"segment1": ["123:GTCA", "345:AAAA"], "segment2": ["123:GTCA", "345:AAAA"]}""",
        description = "The key is the segment name, the value is a list of nucleotide insertions",
    )
    val nucleotideInsertions: Map<SegmentName, List<Insertion>>,
    @Schema(
        example = """{"gene1": "NRNR", "gene2": "NRNR"}""",
        description = "The key is the gene name, the value is the amino acid sequence",
    )
    val alignedAminoAcidSequences: Map<GeneName, GeneticSequence?>,
    @Schema(
        example = """{"gene1": ["123:RRN", "345:NNN"], "gene2": ["123:NNR", "345:RN"]}""",
        description = "The key is the gene name, the value is a list of amino acid insertions",
    )
    val aminoAcidInsertions: Map<GeneName, List<Insertion>>,
)

data class ExternalSubmittedData(
    override val accession: Accession,
    override val version: Version,
    val externalMetadata: MetadataMap,
) : AccessionVersionInterface

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
    override fun toString(): String = "$position:$sequence"
}

class InsertionDeserializer : JsonDeserializer<Insertion>() {
    override fun deserialize(p: JsonParser, ctxt: DeserializationContext): Insertion =
        Insertion.fromString(p.valueAsString)
}

data class PreprocessingAnnotation(
    val unprocessedFields: List<PreprocessingAnnotationSource>,
    val processedFields: List<PreprocessingAnnotationSource>,
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

data class GetSequenceResponse(
    val sequenceEntries: List<SequenceEntryStatus>,
    val statusCounts: Map<Status, Int>,
    val processingResultCounts: Map<ProcessingResult, Int>,
)

data class SequenceEntryStatus(
    override val accession: Accession,
    override val version: Version,
    val status: Status,
    val processingResult: ProcessingResult?,
    val groupId: Int,
    val submitter: String,
    val isRevocation: Boolean = false,
    val submissionId: String,
    val dataUseTerms: DataUseTerms,
) : AccessionVersionInterface

data class EditedSequenceEntryData(
    @Schema(example = "LOC_000S01D") override val accession: Accession,
    @Schema(example = "1") override val version: Version,
    val data: OriginalData<GeneticSequence>,
) : AccessionVersionInterface

data class UnprocessedData(
    @Schema(example = "LOC_000S01D") override val accession: Accession,
    @Schema(example = "1") override val version: Version,
    val data: OriginalDataWithFileUrls<GeneticSequence>,
    @Schema(description = "The submission id that was used in the upload to link metadata and sequences")
    val submissionId: String,
    @Schema(description = "The username of the submitter")
    val submitter: String,
    @Schema(example = "42", description = "The id of the group that this sequence entry was submitted by")
    val groupId: Int,
    @Schema(example = "1720304713", description = "Unix timestamp in seconds")
    val submittedAt: Long,
) : AccessionVersionInterface

data class OriginalDataInternal<SequenceType, FilesType>(
    @Schema(
        example = "{\"date\": \"2020-01-01\", \"country\": \"Germany\"}",
        description = "Key value pairs of metadata, as submitted in the metadata file",
    )
    val metadata: Map<String, String>,
    @Schema(
        example = "{\"segment1\": \"ACTG\", \"segment2\": \"GTCA\"}",
        description = "The key is the fastaID, the value is the nucleotide sequence",
    )
    val unalignedNucleotideSequences: Map<FastaId, SequenceType?>,
    @Schema(
        example = """{"raw_reads": [{"fileId": "f1le-uuId-asdf", "name": "myfile.fastaq"]}""",
        description = "A map from file categories, to lists of files. The files can also have URLs.",
    )
    val files: Map<String, List<FilesType>>? = null,
)

typealias OriginalData<SequenceType> = OriginalDataInternal<SequenceType, FileIdAndName>
typealias OriginalDataWithFileUrls<SequenceType> =
    OriginalDataInternal<SequenceType, FileIdAndNameAndReadUrl>

data class AccessionVersionOriginalMetadata(
    override val accession: Accession,
    override val version: Version,
    val submitter: String,
    val isRevocation: Boolean,
    val originalMetadata: Map<String, String?>?,
) : AccessionVersionInterface

enum class Status {
    @JsonProperty("RECEIVED")
    RECEIVED,

    @JsonProperty("IN_PROCESSING")
    IN_PROCESSING,

    @JsonProperty("PROCESSED")
    PROCESSED,

    @JsonProperty("APPROVED_FOR_RELEASE")
    APPROVED_FOR_RELEASE,
    ;

    companion object {
        private val stringToEnumMap: Map<String, Status> = entries.associateBy { it.name }

        fun fromString(statusString: String): Status = stringToEnumMap[statusString]
            ?: throw IllegalArgumentException("Unknown status: $statusString")
    }
}

enum class ProcessingResult {
    /** The sequence has no warnings or errors */
    @JsonProperty("NO_ISSUES")
    NO_ISSUES,

    /** The sequence has warnings but no errors */
    @JsonProperty("HAS_WARNINGS")
    HAS_WARNINGS,

    /** The sequence has errors (and optionally warnings too) */
    @JsonProperty("HAS_ERRORS")
    HAS_ERRORS,
    ;

    companion object {
        private val stringToEnumMap: Map<String, ProcessingResult> = ProcessingResult.entries.associateBy { it.name }

        fun fromString(processingResultString: String?): ProcessingResult? {
            if (processingResultString == null) {
                return null
            }
            return stringToEnumMap[processingResultString]
                ?: throw IllegalArgumentException("Unknown status: $processingResultString")
        }
    }
}

enum class PreprocessingStatus {
    IN_PROCESSING,
    PROCESSED,
}

val InsdcIngestGroupId = 1

enum class EnaDepositionStatus {
    INGESTED,
    READY,
    DEPOSITED,
}

enum class VersionStatus {
    REVOKED, // This is not the highest version of the sequence entry, and a higher version is a revocation
    REVISED, // This is not the highest version of the sequence entry, and no higher version is a revocation
    LATEST_VERSION, // This is the highest version of the sequence entry
}

enum class CompressionFormat(val compressionName: String) {
    ZSTD("zstd"),
}

@Component
class CompressionFormatConverter : Converter<String, CompressionFormat> {
    override fun convert(source: String): CompressionFormat = CompressionFormat.entries.firstOrNull {
        it.compressionName.equals(source, ignoreCase = true)
    }
        ?: throw IllegalArgumentException("Unknown compression: $source")
}

typealias SubmissionIdFilesMap = Map<SubmissionId, FileCategoryFilesMap>

fun SubmissionIdFilesMap.getAllFileIds(): Set<FileId> = this.values.flatMap {
    it.fileIds
}.toSet()

/**
 * A file category like 'raw_reads' or 'logs'.
 */
typealias FileCategory = String

/**
 * Stores a list of file IDs and file names for each file category.
 * These are the files that were submitted for the given category.
 */
typealias FileCategoryFilesMap = Map<FileCategory, List<FileIdAndName>>

val FileCategoryFilesMap.categories: Set<FileCategory>
    get() = this.keys

/** All file IDs used in the map. */
val FileCategoryFilesMap.fileIds: Set<FileId>
    get() = this.values.flatMap { it.map { it.fileId } }.toSet()

fun FileCategoryFilesMap.getFileId(fileCategory: FileCategory, fileName: String): FileId? =
    this[fileCategory]?.find { fileIdAndName -> fileIdAndName.name == fileName }?.fileId

fun FileCategoryFilesMap.getDuplicateFileNames(category: FileCategory): Set<String> {
    val nameCounts = this[category]!!
        .groupingBy { it.name }
        .eachCount()

    return nameCounts.filterValues { it > 1 }.keys
}
