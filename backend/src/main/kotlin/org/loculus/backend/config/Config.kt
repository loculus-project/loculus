package org.loculus.backend.config

import com.fasterxml.jackson.annotation.JsonProperty
import org.apache.commons.lang3.StringUtils.lowerCase
import org.loculus.backend.api.Organism

data class BackendConfig(
    val organisms: Map<String, InstanceConfig>,
    val accessionPrefix: String,
    val dataUseTermsUrls: DataUseTermsUrls?,
) {
    fun getInstanceConfig(organism: Organism) = organisms[organism.name] ?: throw IllegalArgumentException(
        "Organism: ${organism.name} not found in backend config. Available organisms: ${organisms.keys}",
    )
}

data class DataUseTermsUrls(val open: String, val restricted: String)

data class InstanceConfig(val schema: Schema, val referenceGenomes: ReferenceGenome)

data class Schema(val organismName: String, val metadata: List<Metadata>)

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

    @JsonProperty("pango_lineage")
    PANGO_LINEAGE,

    @JsonProperty("boolean")
    BOOLEAN,

    @JsonProperty("authors")
    AUTHORS,

    ;

    override fun toString(): String = lowerCase(name)
}

data class Metadata(val name: String, val type: MetadataType, val required: Boolean = false)
