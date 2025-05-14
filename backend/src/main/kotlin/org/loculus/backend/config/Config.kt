package org.loculus.backend.config

import com.fasterxml.jackson.annotation.JsonProperty
import org.apache.commons.lang3.StringUtils.lowerCase
import org.loculus.backend.api.Organism

data class BackendConfig(
    val organisms: Map<String, InstanceConfig>,
    val accessionPrefix: String,
    val dataUseTerms: DataUseTerms,
) {
    fun getInstanceConfig(organism: Organism) = organisms[organism.name] ?: throw IllegalArgumentException(
        "Organism: ${organism.name} not found in backend config. Available organisms: ${organisms.keys}",
    )
}

data class DataUseTerms(val enabled: Boolean, val urls: DataUseTermsUrls?)

data class DataUseTermsUrls(val open: String, val restricted: String)

data class InstanceConfig(val schema: Schema, val referenceGenomes: ReferenceGenome)

data class Schema(
    val organismName: String,
    val metadata: List<Metadata>,
    val externalMetadata: List<ExternalMetadata> = emptyList(),
    val earliestReleaseDate: EarliestReleaseDate = EarliestReleaseDate(false, emptyList()),
    val submissionDataTypes: SubmissionDataTypes = SubmissionDataTypes(),
)

data class SubmissionDataTypes(
    val consensusSequences: Boolean = true,
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
