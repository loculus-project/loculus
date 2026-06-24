package org.loculus.backend.config

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
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
import org.loculus.backend.config.service.ConfigService
import org.springdoc.core.customizers.OpenApiCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import io.swagger.v3.oas.models.media.Schema as OpenApiSchema

@Configuration
class QueryOpenApiCustomizer {
    private val yamlMapper = ObjectMapper(YAMLFactory()).registerKotlinModule()

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    fun organismSpecificQueryOpenApiCustomizer(configService: ConfigService) = OpenApiCustomizer { openApi ->
        val genericQueryPaths = openApi.paths
            .filterKeys { it.startsWith("/query/{organism}/") }
            .toMap()

        genericQueryPaths.keys.forEach { openApi.paths.remove(it) }

        // Reading organisms hits the config DB. If that is unavailable (e.g. during
        // OpenAPI generation in tests without a database) degrade gracefully to no
        // organism-specific paths rather than failing doc generation entirely.
        val organisms = runCatching {
            configService.listReleasedOrganisms().mapNotNull { listing ->
                runCatching { listing.key to configService.getOrganismConfig(listing.key).config }.getOrNull()
            } + overviewOpenApiConfig(configService)
        }.getOrDefault(emptyList())

        genericQueryPaths.forEach { (genericPath, genericPathItem) ->
            organisms.forEach { (organism, organismConfig) ->
                val pathItem = clonePathItem(genericPathItem)
                customizePathItem(pathItem, genericPath, organism, organismConfig)
                if (pathItem.readOperations().isNotEmpty()) {
                    openApi.paths.addPathItem(genericPath.replace("{organism}", organism), pathItem)
                }
            }
        }
        updateLapisProxyOpenApiTags(openApi)
    }

    private fun customizePathItem(
        pathItem: PathItem,
        genericPath: String,
        organism: String,
        organismConfig: OrganismConfig,
    ) {
        pathItem.readOperationsMap().forEach { (method, operation) ->
            val kind = classifyEndpoint(genericPath) ?: return@forEach
            if (!supportsEndpoint(kind, organismConfig)) {
                removeOperation(pathItem, method)
                return@forEach
            }
            operation.tags = listOf("Query: $organism")
            operation.parameters = pathParameters(operation, kind, organism, organismConfig) +
                getQueryParameters(kind, organismConfig)

            if (operation.requestBody != null) {
                operation.requestBody = RequestBody().content(
                    Content().addMediaType(
                        "application/json",
                        MediaType().schema(postBodySchema(kind, organismConfig)),
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

    private fun supportsEndpoint(kind: QueryEndpointKind, organismConfig: OrganismConfig): Boolean {
        val supportsConsensusSequences = organismConfig.schema.submissionDataTypes.consensusSequences
        val hasNucleotideSequences = organismConfig.referenceGenome.nucleotideSequences.isNotEmpty()
        val hasAlignedNucleotideSequences = organismConfig.schema.submissionDataTypes.alignedNucleotideSequences
        val hasGenes = organismConfig.referenceGenome.genes.isNotEmpty()

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

    private fun postBodySchema(kind: QueryEndpointKind, organismConfig: OrganismConfig): OpenApiSchema<Any> {
        val fieldNames = metadataFieldNames(organismConfig)
        val schema = ObjectSchema()
            .description("LAPIS-compatible query body for ${organismConfig.schema.organismName}.")
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

        metadataFields(organismConfig).forEach { metadata ->
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

        schema.addProperty(
            "dataFormat",
            StringSchema()
                ._enum(kind.dataFormats())
                .description("Response format for this endpoint."),
        )

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

    private fun getQueryParameters(kind: QueryEndpointKind, organismConfig: OrganismConfig): List<Parameter> {
        val fieldNames = metadataFieldNames(organismConfig)
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
        parameters.addAll(metadataFilterQueryParameters(organismConfig))

        if (kind.supportsFields()) {
            parameters.add(
                queryParameter(
                    "fields",
                    arrayOfStrings(fieldNames),
                    "Metadata fields to return. Repeat the parameter or pass comma-separated values.",
                ),
            )
        }
        parameters.add(
            queryParameter(
                "dataFormat",
                StringSchema()._enum(kind.dataFormats()),
                "Response format for this endpoint.",
            ),
        )
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
        organismConfig: OrganismConfig,
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
                    parameter.schema = StringSchema()._enum(nucleotideSequenceNames(organismConfig))
                }

                "referenceName" -> {
                    parameter.description = "Nucleotide reference name for $organism."
                    parameter.schema = StringSchema()._enum(nucleotideSequenceNames(organismConfig))
                }

                "geneName" -> {
                    parameter.description = "Gene name for $organism."
                    parameter.schema = StringSchema()._enum(geneNames(organismConfig))
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

    private fun metadataFilterQueryParameters(organismConfig: OrganismConfig) =
        metadataFields(organismConfig).flatMap { metadata ->
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

                MetadataType.INTEGER,
                MetadataType.FLOAT,
                MetadataType.NUMBER,
                MetadataType.DATE,
                MetadataType.TIMESTAMP,
                -> {
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

            MetadataType.INTEGER,
            MetadataType.FLOAT,
            MetadataType.NUMBER,
            MetadataType.DATE,
            MetadataType.TIMESTAMP,
            -> {
                schema.addProperty("${metadata.name}From", metadataFilterSchema(metadata))
                schema.addProperty("${metadata.name}To", metadataFilterSchema(metadata))
            }

            MetadataType.BOOLEAN -> Unit
        }
    }

    private fun metadataFilterSchema(metadata: BaseMetadata): OpenApiSchema<*> {
        val schema = when (metadata.type) {
            MetadataType.STRING, MetadataType.AUTHORS -> StringSchema()
            MetadataType.INTEGER, MetadataType.TIMESTAMP -> IntegerSchema()
            MetadataType.FLOAT, MetadataType.NUMBER -> NumberSchema()
            MetadataType.DATE -> StringSchema().format("date")
            MetadataType.BOOLEAN -> BooleanSchema()
        }
        schema.description = "Filter by ${metadata.name}."
        schema.nullable = true
        return schema
    }

    private fun metadataFields(organismConfig: OrganismConfig) =
        (organismConfig.schema.metadata + organismConfig.schema.externalMetadata)
            .distinctBy { it.name }

    private fun metadataFieldNames(organismConfig: OrganismConfig) = metadataFields(organismConfig).map { it.name }

    private fun nucleotideSequenceNames(organismConfig: OrganismConfig) =
        organismConfig.referenceGenome.nucleotideSequences.map { it.name }

    private fun geneNames(organismConfig: OrganismConfig) = organismConfig.referenceGenome.genes.map { it.name }

    private fun compressionFormats() = listOf("gzip", "zstd")

    private fun clonePathItem(pathItem: PathItem): PathItem = Json.mapper().convertValue(pathItem, PathItem::class.java)

    private fun overviewOpenApiConfig(configService: ConfigService): List<Pair<String, OrganismConfig>> = runCatching {
        configService.getInstanceConfig().config.configuredViews().map { (key, view) ->
            key to view.toOrganismConfig()
        }
    }.getOrDefault(emptyList())

    private fun ViewConfig.toOrganismConfig(): OrganismConfig {
        val root = yamlMapper.readTree(schema)
        val schemaNode = root.required("schema")
        val metadata = schemaNode.required("metadata").map { yamlMapper.treeToValue(it, Metadata::class.java) }
        val sequenceSegments = sequenceData
            ?.unalignedNucleotideSequences
            ?.takeIf { it.enabled }
            ?.segments
            .orEmpty()
        return OrganismConfig(
            schema = Schema(
                organismName = displayName,
                metadata = metadata,
                inputFields = emptyList(),
                tableColumns = tableColumns,
                primaryKey = schemaNode.path("primaryKey").asText("accessionVersion"),
                defaultOrderBy = schemaNode.path(
                    "defaultOrderBy",
                ).asText(schemaNode.path("primaryKey").asText("accessionVersion")),
                defaultOrder = when (schemaNode.path("defaultOrder").asText("ascending")) {
                    "descending" -> OrderDirection.DESCENDING
                    else -> OrderDirection.ASCENDING
                },
                submissionDataTypes = SubmissionDataTypes(
                    consensusSequences = sequenceSegments.isNotEmpty(),
                    alignedNucleotideSequences = false,
                ),
            ),
            referenceGenome = ReferenceGenome(sequenceSegments.map { ReferenceSequence(it, "N") }, emptyList()),
            displayName = displayName,
            lapisUrl = lapisUrl,
        )
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

    fun supportsFields() = this == METADATA ||
        this == AGGREGATED ||
        this == NUCLEOTIDE_MUTATIONS ||
        this == AMINO_ACID_MUTATIONS

    fun supportsFastaHeaderTemplate() = isSequenceEndpoint()

    fun supportsMinProportion() = this == NUCLEOTIDE_MUTATIONS || this == AMINO_ACID_MUTATIONS

    fun dataFormats() = when {
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
