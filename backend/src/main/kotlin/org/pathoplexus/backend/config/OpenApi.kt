package org.pathoplexus.backend.config

import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.media.Schema
import org.pathoplexus.backend.controller.PROJECT_NAME

const val ORGANISM_SCHEMA_NAME = "Organism"

fun buildOpenApiSchema(backendConfig: BackendConfig): OpenAPI {
    return OpenAPI()
        .components(
            Components()
                .addSchemas(
                    ORGANISM_SCHEMA_NAME,
                    Schema<String>()
                        .type("string")
                        .description("valid names of organisms that this $PROJECT_NAME instance supports")
                        ._enum(backendConfig.instances.keys.toList()),
                ),
        )
}
