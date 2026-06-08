package org.loculus.backend.config

import io.swagger.v3.core.util.Json
import io.swagger.v3.oas.models.Operation
import io.swagger.v3.oas.models.PathItem
import io.swagger.v3.oas.models.media.ArraySchema
import io.swagger.v3.oas.models.media.BooleanSchema
import io.swagger.v3.oas.models.media.Content
import io.swagger.v3.oas.models.media.IntegerSchema
import io.swagger.v3.oas.models.media.MediaType
import io.swagger.v3.oas.models.media.NumberSchema
import io.swagger.v3.oas.models.media.ObjectSchema
import io.swagger.v3.oas.models.media.StringSchema
import io.swagger.v3.oas.models.parameters.Parameter
import io.swagger.v3.oas.models.parameters.QueryParameter
import io.swagger.v3.oas.models.parameters.RequestBody
import io.swagger.v3.oas.models.tags.Tag
import org.springdoc.core.customizers.OpenApiCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import io.swagger.v3.oas.models.media.Schema as OpenApiSchema

@Configuration
class QueryOpenApiCustomizer {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    fun organismSpecificQueryOpenApiCustomizer(backendConfig: BackendConfig) = OpenApiCustomizer { openApi ->
        val genericQueryPaths = openApi.paths
            .filterKeys { it.startsWith("/query/{organism}/") }
            .toMap()

        genericQueryPaths.keys.forEach { openApi.paths.remove(it) }

        genericQueryPaths.forEach { (genericPath, genericPathItem) ->
            backendConfig.organisms.forEach { (organism, instanceConfig) ->
                val pathItem = clonePathItem(genericPathItem)
                customizePathItem(pathItem, genericPath, organism, instanceConfig)
                if (pathItem.readOperations().isNotEmpty()) {
                    openApi.paths.addPathItem(genericPath.replace("{organism}", organism), pathItem)
                }
            }
        }
        updateTags(openApi)
    }

    private fun customizePathItem(
        pathItem: PathItem,
        genericPath: String,
        organism: String,
        instanceConfig: InstanceConfig,
    ) {
        pathItem.readOperationsMap().forEach { (method, operation) ->
            val kind = classifyEndpoint(genericPath) ?: return@forEach
            if (!supportsEndpoint(kind, instanceConfig)) {
                removeOperation(pathItem, method)
                return@forEach
            }
            operation.tags = listOf("Query: $organism")
            operation.parameters = pathParameters(operation, kind, organism, instanceConfig) +
                getQueryParameters(kind, instanceConfig)

            if (operation.requestBody != null) {
                operation.requestBody = RequestBody().content(
                    Content().addMediaType(
                        "application/json",
                        MediaType().schema(postBodySchema(kind, instanceConfig)),
                    ),
                )
            }
        }
    }

    private fun classifyEndpoint(genericPath: String): QueryEndpointKind? = when {
        genericPath.endsWith("/metadata") -> QueryEndpointKind.METADATA

        genericPath.endsWith("/aggregated") -> QueryEndpointKind.AGGREGATED

        genericPath.endsWith("/sequences/{segment}") -> QueryEndpointKind.UNALIGNED_SEQUENCES_SEGMENT

        genericPath.endsWith("/sequences") -> QueryEndpointKind.UNALIGNED_SEQUENCES

        genericPath.endsWith("/sequencesAligned/insertions") -> QueryEndpointKind.NUCLEOTIDE_INSERTIONS

        genericPath.endsWith("/sequencesAligned/mutations") ||
            genericPath.endsWith("/sequencesAligned/aggregatedMutations") ||
            genericPath.endsWith("/sequencesAligned/{referenceName}/mutations") ||
            genericPath.endsWith("/sequencesAligned/{referenceName}/aggregatedMutations") ->
            QueryEndpointKind.NUCLEOTIDE_MUTATIONS

        genericPath.endsWith(
            "/sequencesAligned/{referenceName}",
        ) -> QueryEndpointKind.ALIGNED_NUCLEOTIDE_SEQUENCES_REFERENCE

        genericPath.endsWith("/sequencesAligned") -> QueryEndpointKind.ALIGNED_NUCLEOTIDE_SEQUENCES

        genericPath.endsWith("/translations/insertions") -> QueryEndpointKind.AMINO_ACID_INSERTIONS

        genericPath.endsWith("/translations/mutations") ||
            genericPath.endsWith("/translations/{geneName}/mutations") ||
            genericPath.endsWith("/translations/{geneName}/aggregatedMutations") ->
            QueryEndpointKind.AMINO_ACID_MUTATIONS

        genericPath.endsWith("/translations/{geneName}") -> QueryEndpointKind.TRANSLATIONS

        else -> null
    }

    private fun supportsEndpoint(kind: QueryEndpointKind, instanceConfig: InstanceConfig): Boolean {
        val supportsConsensusSequences = instanceConfig.schema.submissionDataTypes.consensusSequences
        val hasNucleotideSequences = instanceConfig.referenceGenome.nucleotideSequences.isNotEmpty()
        val hasAlignedNucleotideSequences = instanceConfig.schema.submissionDataTypes.alignedNucleotideSequences
        val hasGenes = instanceConfig.referenceGenome.genes.isNotEmpty()

        return when (kind) {
            QueryEndpointKind.METADATA,
            QueryEndpointKind.AGGREGATED,
            -> true

            QueryEndpointKind.UNALIGNED_SEQUENCES,
            QueryEndpointKind.UNALIGNED_SEQUENCES_SEGMENT,
            -> supportsConsensusSequences && hasNucleotideSequences

            QueryEndpointKind.ALIGNED_NUCLEOTIDE_SEQUENCES,
            QueryEndpointKind.ALIGNED_NUCLEOTIDE_SEQUENCES_REFERENCE,
            QueryEndpointKind.NUCLEOTIDE_MUTATIONS,
            QueryEndpointKind.NUCLEOTIDE_INSERTIONS,
            -> supportsConsensusSequences && hasNucleotideSequences && hasAlignedNucleotideSequences

            QueryEndpointKind.TRANSLATIONS,
            QueryEndpointKind.AMINO_ACID_MUTATIONS,
            QueryEndpointKind.AMINO_ACID_INSERTIONS,
            -> supportsConsensusSequences && hasGenes
        }
    }

    private fun postBodySchema(kind: QueryEndpointKind, instanceConfig: InstanceConfig): OpenApiSchema<Any> {
        val fieldNames = metadataFieldNames(instanceConfig)
        val schema = ObjectSchema()
            .description("LAPIS-compatible query body for ${instanceConfig.schema.organismName}.")
            .addProperty("limit", IntegerSchema().description("Maximum number of rows to return."))
            .addProperty("offset", IntegerSchema().description("Number of rows to skip."))
            .addProperty(
                "orderBy",
                ArraySchema()
                    .items(orderBySchema(fieldNames))
                    .description("Metadata fields to order by."),
            )
            .addProperty("advancedQuery", StringSchema().description("LAPIS advanced query expression."))
            .addProperty(
                "nucleotideMutations",
                ArraySchema()
                    .items(StringSchema().example("main:A123T"))
                    .description("Nucleotide mutation filters."),
            )
            .addProperty(
                "aminoAcidMutations",
                ArraySchema()
                    .items(StringSchema().example("S:123T"))
                    .description("Amino acid mutation filters."),
            )
            .addProperty(
                "nucleotideInsertions",
                ArraySchema()
                    .items(StringSchema().example("ins_123:ATT"))
                    .description("Nucleotide insertion filters."),
            )
            .addProperty(
                "aminoAcidInsertions",
                ArraySchema()
                    .items(StringSchema().example("ins_ORF1a:123:ATT"))
                    .description("Amino acid insertion filters."),
            )
            .addProperty(
                "downloadAsFile",
                BooleanSchema().description("Set to true to download the response as a file."),
            )
            .addProperty("downloadFileBasename", StringSchema().description("Base name for the downloaded file."))
            .addProperty(
                "compression",
                StringSchema()._enum(compressionFormats())
                    .description("Optional response compression. Omit for an uncompressed response."),
            )
        schema.additionalProperties = true

        metadataFields(instanceConfig).forEach { metadata ->
            addMetadataFilterProperties(schema, metadata)
        }

        if (kind.supportsFields()) {
            schema.addProperty(
                "fields",
                ArraySchema()
                    .items(StringSchema()._enum(fieldNames))
                    .description("Metadata fields to return or aggregate."),
            )
        }

        if (kind.supportsPostDataFormat()) {
            schema.addProperty(
                "dataFormat",
                StringSchema()
                    ._enum(kind.postDataFormats())
                    .description("Response format for this endpoint."),
            )
        }

        if (kind.supportsFastaHeaderTemplate()) {
            schema.addProperty(
                "fastaHeaderTemplate",
                StringSchema().description("Template for FASTA headers, e.g. {accessionVersion}."),
            )
        }

        if (kind.supportsMinProportion()) {
            schema.addProperty("minProportion", NumberSchema().description("Minimum mutation proportion to return."))
        }

        schema.example = kind.postExample(fieldNames)
        return schema
    }

    private fun getQueryParameters(kind: QueryEndpointKind, instanceConfig: InstanceConfig): List<Parameter> {
        if (!kind.supportsGetParameters()) {
            return emptyList()
        }
        val fieldNames = metadataFieldNames(instanceConfig)
        val parameters = mutableListOf(
            queryParameter("downloadAsFile", BooleanSchema(), "Set to true to download the response as a file."),
            queryParameter("downloadFileBasename", StringSchema(), "Base name for the downloaded file."),
            queryParameter(
                "compression",
                StringSchema()._enum(compressionFormats()),
                "Optional response compression. Omit for an uncompressed response.",
            ),
            queryParameter("limit", IntegerSchema(), "Maximum number of rows to return."),
            queryParameter("offset", IntegerSchema(), "Number of rows to skip."),
            queryParameter("orderBy", StringSchema(), "Fields to order by, for example date or date:descending."),
            queryParameter("advancedQuery", StringSchema(), "LAPIS advanced query expression."),
            queryParameter("nucleotideMutations", arrayOfStrings(), "Nucleotide mutation filters."),
            queryParameter("aminoAcidMutations", arrayOfStrings(), "Amino acid mutation filters."),
            queryParameter("nucleotideInsertions", arrayOfStrings(), "Nucleotide insertion filters."),
            queryParameter("aminoAcidInsertions", arrayOfStrings(), "Amino acid insertion filters."),
        )
        parameters.addAll(metadataFilterQueryParameters(instanceConfig))

        if (kind.supportsFields()) {
            parameters.add(
                queryParameter(
                    "fields",
                    arrayOfStrings(fieldNames),
                    "Metadata fields to return. Repeat the parameter or pass comma-separated values.",
                ),
            )
        }
        if (kind.supportsGetDataFormat()) {
            parameters.add(
                queryParameter(
                    "dataFormat",
                    StringSchema()._enum(kind.getDataFormats()),
                    "Response format for this endpoint.",
                ),
            )
        }
        if (kind.supportsFastaHeaderTemplate()) {
            parameters.add(
                queryParameter(
                    "fastaHeaderTemplate",
                    StringSchema(),
                    "Template for FASTA headers, e.g. {accessionVersion}.",
                ),
            )
        }
        if (kind.supportsMinProportion()) {
            parameters.add(queryParameter("minProportion", NumberSchema(), "Minimum mutation proportion to return."))
        }

        return parameters
    }

    private fun pathParameters(
        operation: Operation,
        kind: QueryEndpointKind,
        organism: String,
        instanceConfig: InstanceConfig,
    ) = operation.parameters
        ?.filterNot { it.name == "organism" || it.name == "Accept" }
        ?.onEach { parameter ->
            when (parameter.name) {
                "versionGroup" -> {
                    parameter.description = "Use current for latest versions or allVersions for version history."
                    parameter.example = "current"
                    parameter.schema = StringSchema()._enum(listOf("current", "allVersions"))
                }

                "segment" -> {
                    parameter.description = "Sequence segment name for $organism."
                    parameter.schema = StringSchema()._enum(nucleotideSequenceNames(instanceConfig))
                }

                "referenceName" -> {
                    parameter.description = "Nucleotide reference name for $organism."
                    parameter.schema = StringSchema()._enum(nucleotideSequenceNames(instanceConfig))
                }

                "geneName" -> {
                    parameter.description = "Gene name for $organism."
                    parameter.schema = StringSchema()._enum(geneNames(instanceConfig))
                }
            }
        }
        ?.filter { parameter ->
            parameter.name != "segment" || kind == QueryEndpointKind.UNALIGNED_SEQUENCES_SEGMENT
        }
        ?: emptyList()

    private fun removeOperation(pathItem: PathItem, method: PathItem.HttpMethod) {
        when (method) {
            PathItem.HttpMethod.GET -> pathItem.get = null
            PathItem.HttpMethod.PUT -> pathItem.put = null
            PathItem.HttpMethod.POST -> pathItem.post = null
            PathItem.HttpMethod.DELETE -> pathItem.delete = null
            PathItem.HttpMethod.OPTIONS -> pathItem.options = null
            PathItem.HttpMethod.HEAD -> pathItem.head = null
            PathItem.HttpMethod.PATCH -> pathItem.patch = null
            PathItem.HttpMethod.TRACE -> pathItem.trace = null
        }
    }

    private fun queryParameter(name: String, schema: OpenApiSchema<*>, description: String) = QueryParameter().apply {
        this.name = name
        this.required = false
        this.description = description
        this.schema = schema
    }

    private fun metadataFilterQueryParameters(instanceConfig: InstanceConfig) =
        metadataFields(instanceConfig).flatMap { metadata ->
            val parameters = mutableListOf(
                queryParameter(metadata.name, metadataFilterSchema(metadata), "Filter by ${metadata.name}."),
                queryParameter(
                    "${metadata.name}.isNull",
                    BooleanSchema(),
                    "Filter by nullness of ${metadata.name}.",
                ),
            )
            when (metadata.type) {
                MetadataType.STRING, MetadataType.AUTHORS -> parameters.add(
                    queryParameter(
                        "${metadata.name}.regex",
                        StringSchema(),
                        "Regex filter for ${metadata.name}.",
                    ),
                )

                MetadataType.INTEGER, MetadataType.FLOAT, MetadataType.NUMBER, MetadataType.DATE -> {
                    parameters.add(
                        queryParameter(
                            "${metadata.name}From",
                            metadataFilterSchema(metadata),
                            "Lower bound filter for ${metadata.name}.",
                        ),
                    )
                    parameters.add(
                        queryParameter(
                            "${metadata.name}To",
                            metadataFilterSchema(metadata),
                            "Upper bound filter for ${metadata.name}.",
                        ),
                    )
                }

                MetadataType.BOOLEAN -> Unit
            }
            parameters
        }

    private fun arrayOfStrings(values: List<String>) = ArraySchema()
        .items(StringSchema()._enum(values))

    private fun arrayOfStrings() = ArraySchema()
        .items(StringSchema())

    private fun orderBySchema(fieldNames: List<String>) = ObjectSchema()
        .addProperty("field", StringSchema()._enum(fieldNames))
        .addProperty("type", StringSchema()._enum(listOf("ascending", "descending")))

    private fun addMetadataFilterProperties(schema: OpenApiSchema<Any>, metadata: BaseMetadata) {
        schema.addProperty(metadata.name, metadataFilterSchema(metadata))
        schema.addProperty(
            "${metadata.name}.isNull",
            BooleanSchema().description("Filter by nullness of ${metadata.name}."),
        )
        when (metadata.type) {
            MetadataType.STRING, MetadataType.AUTHORS -> schema.addProperty(
                "${metadata.name}.regex",
                StringSchema().description("Regex filter for ${metadata.name}."),
            )

            MetadataType.INTEGER, MetadataType.FLOAT, MetadataType.NUMBER, MetadataType.DATE -> {
                schema.addProperty("${metadata.name}From", metadataFilterSchema(metadata))
                schema.addProperty("${metadata.name}To", metadataFilterSchema(metadata))
            }

            MetadataType.BOOLEAN -> Unit
        }
    }

    private fun metadataFilterSchema(metadata: BaseMetadata): OpenApiSchema<*> {
        val schema = when (metadata.type) {
            MetadataType.STRING, MetadataType.AUTHORS -> StringSchema()
            MetadataType.INTEGER -> IntegerSchema()
            MetadataType.FLOAT, MetadataType.NUMBER -> NumberSchema()
            MetadataType.DATE -> StringSchema().format("date")
            MetadataType.BOOLEAN -> BooleanSchema()
        }
        schema.description = "Filter by ${metadata.name}."
        schema.nullable = true
        return schema
    }

    private fun metadataFields(instanceConfig: InstanceConfig) =
        (instanceConfig.schema.metadata + instanceConfig.schema.externalMetadata)
            .distinctBy { it.name }

    private fun metadataFieldNames(instanceConfig: InstanceConfig) = metadataFields(instanceConfig).map { it.name }

    private fun nucleotideSequenceNames(instanceConfig: InstanceConfig) =
        instanceConfig.referenceGenome.nucleotideSequences.map { it.name }

    private fun geneNames(instanceConfig: InstanceConfig) = instanceConfig.referenceGenome.genes.map { it.name }

    private fun compressionFormats() = listOf("gzip", "zstd")

    private fun clonePathItem(pathItem: PathItem): PathItem = Json.mapper().convertValue(pathItem, PathItem::class.java)

    private fun updateTags(openApi: io.swagger.v3.oas.models.OpenAPI) {
        val operationTagNames = openApi.paths.orEmpty().values
            .flatMap { it.readOperations() }
            .flatMap { it.tags.orEmpty() }
            .distinct()
        val tagsByName = linkedMapOf<String, Tag>()
        openApi.tags.orEmpty()
            .filter { it.name in operationTagNames }
            .forEach { tag -> tagsByName[tag.name] = tag }
        operationTagNames.forEach { tagName -> tagsByName.putIfAbsent(tagName, Tag().name(tagName)) }
        tagsByName[LAPIS_PROXY_CONTROLLER_TAG] = tagsByName[LAPIS_PROXY_CONTROLLER_TAG]
            ?: Tag().name(LAPIS_PROXY_CONTROLLER_TAG)
        tagsByName[LAPIS_PROXY_CONTROLLER_TAG]?.description(
            "This is temporary and used for calls that have not yet switched to using the new query API.",
        )
        openApi.tags = orderOpenApiTags(tagsByName.values)
    }
}

private enum class QueryEndpointKind {
    METADATA,
    AGGREGATED,
    UNALIGNED_SEQUENCES,
    UNALIGNED_SEQUENCES_SEGMENT,
    ALIGNED_NUCLEOTIDE_SEQUENCES,
    ALIGNED_NUCLEOTIDE_SEQUENCES_REFERENCE,
    NUCLEOTIDE_MUTATIONS,
    NUCLEOTIDE_INSERTIONS,
    TRANSLATIONS,
    AMINO_ACID_MUTATIONS,
    AMINO_ACID_INSERTIONS,
    ;

    fun supportsPostDataFormat() = true

    fun supportsFields() = this == METADATA ||
        this == AGGREGATED ||
        this == NUCLEOTIDE_MUTATIONS ||
        this == AMINO_ACID_MUTATIONS

    fun supportsGetParameters() = true

    fun supportsGetDataFormat() = true

    fun supportsFastaHeaderTemplate() = isSequenceEndpoint()

    fun supportsMinProportion() = this == NUCLEOTIDE_MUTATIONS || this == AMINO_ACID_MUTATIONS

    fun postDataFormats() = when {
        isSequenceEndpoint() -> listOf("FASTA", "JSON", "NDJSON")
        else -> listOf("JSON", "CSV", "CSV-WITHOUT-HEADERS", "TSV", "TSV-ESCAPED")
    }

    fun getDataFormats() = when {
        isSequenceEndpoint() -> listOf("FASTA", "JSON", "NDJSON")
        else -> listOf("JSON", "CSV", "CSV-WITHOUT-HEADERS", "TSV", "TSV-ESCAPED")
    }

    fun postExample(fieldNames: List<String>) = when {
        this == METADATA -> mapOf("fields" to fieldNames.take(1), "limit" to 10)
        this == AGGREGATED -> mapOf("fields" to fieldNames.take(1))
        isSequenceEndpoint() -> mapOf("dataFormat" to "FASTA", "limit" to 10)
        supportsMinProportion() -> mapOf("minProportion" to 0.01)
        else -> mapOf("limit" to 10)
    }

    private fun isSequenceEndpoint() = this == UNALIGNED_SEQUENCES ||
        this == UNALIGNED_SEQUENCES_SEGMENT ||
        this == ALIGNED_NUCLEOTIDE_SEQUENCES ||
        this == ALIGNED_NUCLEOTIDE_SEQUENCES_REFERENCE ||
        this == TRANSLATIONS
}
