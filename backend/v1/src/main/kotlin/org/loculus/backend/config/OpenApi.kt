package org.loculus.backend.config

import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.media.Schema
import io.swagger.v3.oas.models.security.SecurityRequirement
import io.swagger.v3.oas.models.security.SecurityScheme
import org.loculus.backend.controller.PROJECT_NAME

const val ORGANISM_SCHEMA_NAME = "Organism"

fun buildOpenApiSchema(backendConfig: BackendConfig): OpenAPI = OpenAPI()
    .addSecurityItem(SecurityRequirement().addList("bearerAuth"))
    .components(
        Components()
            .addSchemas(
                ORGANISM_SCHEMA_NAME,
                Schema<String>()
                    .type("string")
                    .description("valid names of organisms that this $PROJECT_NAME instance supports")
                    ._enum(backendConfig.organisms.keys.toList()),
            )
            .addSecuritySchemes(
                "bearerAuth",
                SecurityScheme().name("bearerAuth").type(SecurityScheme.Type.HTTP).`in`(SecurityScheme.In.HEADER)
                    .scheme("bearer")
                    .bearerFormat("JWT"),
            ),
    )
