package org.loculus.backend.config

import com.fasterxml.jackson.annotation.JsonProperty
import org.apache.commons.lang3.StringUtils.lowerCase
import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Backend technical configuration sourced from Spring/Helm. Domain config (organisms,
 * accessionPrefix, dataUseTerms, fileSharing) now lives in the database and is accessed
 * via [org.loculus.backend.config.service.ConfigService].
 */
@ConfigurationProperties(prefix = "loculus.backend")
data class BackendConfig(
    val websiteUrl: String,
    val backendUrl: String,
    val zstdCompressionLevel: Int = 10,
    val readOnlyMode: Boolean = false,
)

data class DataUseTerms(val enabled: Boolean, val urls: DataUseTermsUrls?)

data class DataUseTermsUrls(val open: String, val restricted: String)

data class FileSharing(val outputFileUrlType: FileUrlType = FileUrlType.WEBSITE)

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

data class OrganismConfig(
    val schema: Schema,
    val referenceGenome: ReferenceGenome,
    /**
     * Human-facing display name for this organism (e.g. "Lassa virus"). The
     * canonical name field for new code — read by `PublicConfigController`
     * and (preferred) by the website's `configTransform`. Nullable so a
     * freshly-created unreleased organism can exist before an admin assigns
     * a name; consumers fall back to the organism key.
     *
     * Note: there is a historical second name field, `schema.organismName`,
     * inherited from the pre-DB Helm values schema. It is preserved for
     * backward compatibility with the website's internal schema type and the
     * SILO database config (`instanceName`); new code should not read it,
     * and a follow-up cleanup will drop it once those consumers migrate.
     */
    val displayName: String? = null,
    val description: String? = null,
    val image: OrganismImage? = null,
    val referenceGenomes: List<ReferenceGenomeSegment>? = null,
)

data class OrganismImage(val url: String)

data class LinkOut(
    val name: String,
    val url: String,
    val maxNumberOfRecommendedEntries: Int? = null,
    val onlyForReferences: Map<String, String>? = null,
    val category: String? = null,
)

data class MultiFieldSearch(
    val name: String,
    val displayName: String,
    val fields: List<String>,
    val orderInSearchDisplay: Int? = null,
)

data class InputFieldOption(val name: String)

data class InputField(
    val name: String,
    val displayName: String? = null,
    val noEdit: Boolean? = null,
    val required: Boolean? = null,
    val definition: String? = null,
    val example: Any? = null,
    val guidance: String? = null,
    val desired: Boolean? = null,
    val options: List<InputFieldOption>? = null,
)

data class ReferenceGenomeSegment(val name: String, val displayName: String? = null, val references: List<Reference>)

data class Reference(
    val name: String,
    val displayName: String? = null,
    val sequence: String,
    val insdcAccessionFull: String? = null,
    val genes: List<ReferenceGene>? = null,
)

data class ReferenceGene(val name: String, val sequence: String)

enum class OrderDirection {
    @JsonProperty("ascending")
    ASCENDING,

    @JsonProperty("descending")
    DESCENDING,

    ;

    override fun toString(): String = lowerCase(name)
}

data class Schema(
    /**
     * **Legacy.** The original required name field from the pre-DB Helm
     * config schema. Still read by the website's `configTransform` (which
     * maps it onto the website-internal `Schema.organismName`) and by the
     * SILO database config's `instanceName`. New code should prefer
     * `OrganismConfig.displayName` and treat this as a backward-compat
     * fallback; this field will be removed once all consumers migrate.
     */
    val organismName: String,
    val image: String? = null,
    val metadata: List<Metadata>,
    val externalMetadata: List<ExternalMetadata> = emptyList(),
    val metadataTemplate: List<String>? = null,
    val inputFields: List<InputField> = emptyList(),
    val tableColumns: List<String> = emptyList(),
    val primaryKey: String? = null,
    val defaultOrderBy: String? = null,
    val defaultOrder: OrderDirection? = null,
    val earliestReleaseDate: EarliestReleaseDate = EarliestReleaseDate(false, emptyList()),
    val submissionDataTypes: SubmissionDataTypes = SubmissionDataTypes(),
    val files: List<FileCategory> = emptyList(), // Allowed file categories for output files
    val loadSequencesAutomatically: Boolean? = null,
    val richFastaHeaderFields: List<String>? = null,
    val linkOuts: List<LinkOut> = emptyList(),
    val referenceIdentifierField: String? = null,
    val multiFieldSearches: List<MultiFieldSearch>? = null,
)

data class SubmissionDataTypes(
    val consensusSequences: Boolean = true,
    val maxSequencesPerEntry: Int? = null, // null means unlimited sequences per entry
    // Allowed file categories for submission files
    val files: FilesSubmissionDataType = FilesSubmissionDataType(false, emptyList()),
)

data class FilesSubmissionDataType(val enabled: Boolean = false, val categories: List<FileCategory>)

data class FileCategory(val name: String, val displayName: String? = null)

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

    @JsonProperty("timestamp")
    TIMESTAMP,

    @JsonProperty("boolean")
    BOOLEAN,

    @JsonProperty("authors")
    AUTHORS,

    ;

    override fun toString(): String = lowerCase(name)
}

data class RangeOverlapSearch(val rangeName: String, val rangeDisplayName: String, val bound: RangeBound)

enum class RangeBound {
    @JsonProperty("lower")
    LOWER,

    @JsonProperty("upper")
    UPPER,

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
    val displayName: String? = null,
    val description: String? = null,
    val definition: String? = null,
    val header: String? = null,
    val hidden: Boolean? = null,
    val customDisplay: Map<String, Any>? = null,
    val autocomplete: Boolean? = null,
    val notSearchable: Boolean? = null,
    val noInput: Boolean? = null,
    val hideInSearchResultsTable: Boolean? = null,
    val initiallyVisible: Boolean? = null,
    val hideOnSequenceDetailsPage: Boolean? = null,
    val rangeSearch: Boolean? = null,
    val rangeOverlapSearch: RangeOverlapSearch? = null,
    val substringSearch: Boolean? = null,
    val lineageSearch: Boolean? = null,
    val columnWidth: Int? = null,
    val order: Int? = null,
    val orderOnDetailsPage: Int? = null,
    val orderInSearchDisplay: Int? = null,
    val includeInDownloadsByDefault: Boolean? = null,
    val onlyForReference: String? = null,
    val isSequenceFilter: Boolean? = null,
    val relatesToSegment: String? = null,
    val percentage: Boolean? = null,
    // Adapter-side fields used to render SILO config (see config-tools/src/adapter).
    val perSegment: Boolean? = null,
    val lineageSystem: String? = null,
    val generateIndex: Boolean? = null,
    val oneHeader: Boolean? = null,
    val options: List<MetadataOption>? = null,
    val ingest: String? = null,
    @get:JsonProperty("ontology_id")
    @field:JsonProperty("ontology_id")
    val ontologyId: String? = null,
) : BaseMetadata()

data class MetadataOption(val name: String)

/**
 * Expands `perSegment` metadata fields into one entry per nucleotide segment for
 * multi-segment organisms (e.g. `completeness` -> `completeness_L`,
 * `completeness_M`, `completeness_S`), mirroring the per-segment field names the
 * preprocessing pipeline emits and the SILO/LAPIS adapter config expects.
 * Single-segment organisms are returned unchanged.
 *
 * The backend must use this *effective* metadata field set everywhere it
 * reasons about processed-metadata fields — submit validation
 * ([ProcessedSequenceEntryValidator]) and the released-data projection
 * ([EmptyProcessedDataProvider]) — so the data it accepts, stores and serves
 * stays consistent with SILO's schema. (On the legacy Helm path this expansion
 * was baked into `generateBackendMetadata`.)
 */
fun expandPerSegmentMetadata(metadata: List<Metadata>, segments: List<String>): List<Metadata> {
    if (segments.size <= 1) {
        return metadata
    }
    return metadata.flatMap { field ->
        if (field.perSegment == true) {
            segments.map { segment -> field.copy(name = "${field.name}_$segment") }
        } else {
            listOf(field)
        }
    }
}

/**
 * The nucleotide *segment* names used for perSegment field expansion. The
 * preprocessing pipeline and the SILO/LAPIS adapter derive these from the rich
 * [OrganismConfig.referenceGenomes] (segment names such as `L`/`M`/`S`, or a
 * single `main`) — NOT from the simple [OrganismConfig.referenceGenome]
 * `nucleotideSequences`, which for multi-*reference* organisms holds per-reference
 * entries (e.g. `M-MH396653`, or enterovirus per-type references) that are not
 * segments. Falls back to the simple genome only when `referenceGenomes` is absent.
 */
fun perSegmentExpansionSegments(organismConfig: OrganismConfig): List<String> =
    organismConfig.referenceGenomes?.map { it.name }?.distinct()
        ?: organismConfig.referenceGenome.nucleotideSequences.map { it.name }

data class ExternalMetadata(
    val externalMetadataUpdater: String,
    override val name: String,
    override val type: MetadataType,
    override val required: Boolean = false,
) : BaseMetadata()

data class EarliestReleaseDate(val enabled: Boolean = false, val externalFields: List<String>)
