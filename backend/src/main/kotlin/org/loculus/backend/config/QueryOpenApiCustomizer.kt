package org.loculus.backend.config

import io.swagger.v3.core.util.Json
import io.swagger.v3.oas.models.OpenAPI
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
import io.swagger.v3.oas.models.parameters.RequestBody
import org.springdoc.core.customizers.OpenApiCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import io.swagger.v3.oas.models.media.Schema as OpenApiSchema

@Configuration
class QueryOpenApiCustomizer {

    @Bean
    fun organismSpecificQueryOpenApiCustomizer(backendConfig: BackendConfig) = OpenApiCustomizer { openApi ->
        val genericQueryPaths = openApi.paths
            .filterKeys { it.startsWith("/query/{organism}/") }
            .toMap()

        genericQueryPaths.keys.forEach { openApi.paths.remove(it) }

        genericQueryPaths.forEach { (genericPath, genericPathItem) ->
            backendConfig.organisms.forEach { (organism, instanceConfig) ->
                if (!supportsQueryPath(genericPath, instanceConfig)) {
                    return@forEach
                }
                val concretePath = genericPath.replace("{organism}", organism)
                val pathItem = clonePathItem(genericPathItem)
                customizePathItem(pathItem, genericPath, organism, instanceConfig)
                openApi.paths.addPathItem(concretePath, pathItem)
            }
        }
    }

    private fun supportsQueryPath(genericPath: String, instanceConfig: InstanceConfig): Boolean = when {
        genericPath.contains("/translations") -> instanceConfig.referenceGenome.genes.isNotEmpty()
        genericPath.contains("/sequences") -> instanceConfig.referenceGenome.nucleotideSequences.isNotEmpty()
        else -> true
    }

    private fun customizePathItem(
        pathItem: PathItem,
        genericPath: String,
        organism: String,
        instanceConfig: InstanceConfig,
    ) {
        pathItem.readOperations().forEach { operation ->
            operation.tags = listOf("Query: $organism")
            operation.parameters = operation.parameters
                ?.filterNot { it.name == "organism" }
                ?.onEach { parameter ->
                    when (parameter.name) {
                        "versionGroup" -> {
                            parameter.description =
                                "Use current for latest versions or allVersions for version history."
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

            if (operationHasJsonBody(operation)) {
                operation.requestBody = RequestBody().content(
                    Content().addMediaType(
                        "application/json",
                        MediaType().schema(queryRequestSchema(genericPath, instanceConfig)),
                    ),
                )
            }
        }
    }

    private fun operationHasJsonBody(operation: Operation) = operation.requestBody != null

    private fun queryRequestSchema(genericPath: String, instanceConfig: InstanceConfig): OpenApiSchema<Any> {
        val fieldNames = metadataFieldNames(instanceConfig)
        val schema = ObjectSchema()
            .description("LAPIS-compatible query body for ${instanceConfig.schema.organismName}.")
            .addProperty("limit", IntegerSchema().description("Maximum number of rows to return."))
            .addProperty("offset", IntegerSchema().description("Number of rows to skip."))
            .addProperty(
                "fields",
                ArraySchema()
                    .items(StringSchema()._enum(fieldNames))
                    .description("Metadata fields to return or aggregate."),
            )
            .addProperty(
                "orderBy",
                ArraySchema()
                    .items(orderBySchema(fieldNames))
                    .description("Metadata fields to order by."),
            )
        schema.additionalProperties = true

        metadataFields(instanceConfig).forEach { metadata ->
            schema.addProperty(metadata.name, metadataFilterSchema(metadata))
        }

        if (genericPath.isSequenceEndpoint()) {
            schema.addProperty(
                "dataFormat",
                StringSchema()
                    ._enum(listOf("FASTA", "NDJSON", "JSON"))
                    .description("Sequence response format."),
            )
        }

        if (genericPath.contains("mutations")) {
            schema.addProperty("minProportion", NumberSchema().description("Minimum mutation proportion to return."))
        }

        return schema
    }

    private fun String.isSequenceEndpoint() = endsWith("/sequences") ||
        endsWith("/sequences/{segment}") ||
        endsWith("/sequencesAligned") ||
        endsWith("/sequencesAligned/{referenceName}") ||
        endsWith("/translations/{geneName}")

    private fun orderBySchema(fieldNames: List<String>) = ObjectSchema()
        .addProperty("field", StringSchema()._enum(fieldNames))
        .addProperty("type", StringSchema()._enum(listOf("ascending", "descending")))

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

    private fun clonePathItem(pathItem: PathItem): PathItem = Json.mapper().convertValue(pathItem, PathItem::class.java)
}
