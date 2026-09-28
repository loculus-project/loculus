package org.loculus.backend.config

import com.fasterxml.jackson.annotation.JsonProperty
import org.apache.commons.lang3.StringUtils.lowerCase
import org.loculus.backend.api.Organism

data class BackendConfig(
    val websiteUrl: String,
    val backendUrl: String,
    val organisms: Map<String, InstanceConfig>,
    val accessionPrefix: String,
    val dataUseTerms: DataUseTerms,
    val fileSharing: FileSharing = FileSharing(),
    val zstdCompressionLevel: Int = 10,
    val pipelineVersionUpgradeCheckIntervalSeconds: Long = 10,
    val readOnlyMode: Boolean = false,
) {
    fun getInstanceConfig(organism: Organism) = organisms[organism.name] ?: throw IllegalArgumentException(
        "Organism: ${organism.name} not found in backend config. Available organisms: ${organisms.keys}",
    )

    fun consensusSequencesEnabled(organism: Organism): Boolean =
        getInstanceConfig(organism).schema.submissionDataTypes.consensusSequences
}

data class DataUseTerms(val enabled: Boolean, val urls: DataUseTermsUrls?)

data class DataUseTermsUrls(val open: String, val restricted: String)

data class FileSharing(
    val outputFileUrlType: FileUrlType = FileUrlType.WEBSITE,
    val disableStrictFilenameValidation: Boolean = false,
    val maxFileSizeBytes: Long? = null,
)

/**
 * The types URLs that can be output for a file.
 * We can either link directly to the file in S3, or link to the proxy endpoint on
 * the website.
 */
enum class FileUrlType {
    @JsonProperty("website")
    WEBSITE,

    @JsonProperty("backend")
    BACKEND,

    @JsonProperty("s3")
    S3,

    ;

    override fun toString(): String = lowerCase(name)
}

data class InstanceConfig(
    val schema: Schema,
    val referenceGenome: ReferenceGenome,
    /** only rendered when the query engine is enabled; without it the organism is not queryable */
    val queryEngine: QueryEngineOrganismConfig? = null,
)

/**
 * What the query engine serves for an organism, rendered from the same Helm values as SILO's database config:
 * every LAPIS metadata field (common fields, organism metadata with per-segment fields expanded, file fields) and
 * the lineage-definition URL per pipeline version for each lineage system those fields use.
 */
data class QueryEngineOrganismConfig(
    val metadata: List<QueryEngineMetadata>,
    val lineageSystems: Map<String, Map<Int, String>> = emptyMap(),
)

/**
 * [type] is the Loculus metadata type (`timestamp` and `authors` included). [hierarchicalFilter] is the base URL of
 * the service (the taxonomy service) that turns the field's observed values into a lineage definition.
 */
data class QueryEngineMetadata(
    val name: String,
    val type: String = "string",
    val generateIndex: Boolean = false,
    val lineageSystem: String? = null,
    val hierarchicalFilter: String? = null,
)

data class Schema(
    val organismName: String,
    val metadata: List<Metadata>,
    val externalMetadata: List<ExternalMetadata> = emptyList(),
    val earliestReleaseDate: EarliestReleaseDate = EarliestReleaseDate(false, emptyList()),
    val submissionDataTypes: SubmissionDataTypes = SubmissionDataTypes(),
    val files: List<FileCategory> = emptyList(), // Allowed file categories for output files
)

data class SubmissionDataTypes(
    val consensusSequences: Boolean = true,
    val maxSequencesPerEntry: Int? = null, // null means unlimited sequences per entry
    // Allowed file categories for submission files
    val files: FilesSubmissionDataType = FilesSubmissionDataType(false, emptyList()),
)

data class FilesSubmissionDataType(val enabled: Boolean = false, val categories: List<FileCategory>)

data class FileCategory(val name: String)

// The Json property names need to be kept in sync with website config enum `metadataPossibleTypes` in `config.ts`
// They also need to be in sync with SILO database config, as the Loculus config is a sort of superset of it
// See https://lapis.cov-spectrum.org/gisaid/v2/docs/maintainer-docs/references/database-configuration#metadata-types
enum class MetadataType {
    @JsonProperty("string")
    STRING,

    @JsonProperty("int")
    INTEGER,

    @JsonProperty("float")
    FLOAT,

    @JsonProperty("number")
    NUMBER,

    @JsonProperty("date")
    DATE,

    @JsonProperty("boolean")
    BOOLEAN,

    @JsonProperty("authors")
    AUTHORS,

    ;

    override fun toString(): String = lowerCase(name)
}

// common abstraction
sealed class BaseMetadata {
    abstract val name: String
    abstract val type: MetadataType
    abstract val required: Boolean
}

data class Metadata(
    override val name: String,
    override val type: MetadataType,
    override val required: Boolean = false,
) : BaseMetadata()

data class ExternalMetadata(
    val externalMetadataUpdater: String,
    override val name: String,
    override val type: MetadataType,
    override val required: Boolean = false,
) : BaseMetadata()

data class EarliestReleaseDate(val enabled: Boolean = false, val externalFields: List<String>)
