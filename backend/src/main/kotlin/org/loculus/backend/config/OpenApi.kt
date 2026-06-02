package org.loculus.backend.config

import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.media.Schema
import io.swagger.v3.oas.models.media.StringSchema
import io.swagger.v3.oas.models.security.SecurityRequirement
import io.swagger.v3.oas.models.security.SecurityScheme
import kotlinx.datetime.LocalDateTime
import org.loculus.backend.controller.PROJECT_NAME
import org.springdoc.core.utils.SpringDocUtils

const val ORGANISM_SCHEMA_NAME = "Organism"

// Organism keys are DB-backed; the schema is a plain string and clients should
// consult `GET /api/config/organisms` for the live list of valid keys.
fun buildOpenApiSchema(): OpenAPI {
    SpringDocUtils.getConfig().replaceWithSchema(
        LocalDateTime::class.java,
        StringSchema()
            .format("date-time")
            .example("2026-05-24T12:15:55.221007"),
    )

    return OpenAPI()
        .addSecurityItem(SecurityRequirement().addList("bearerAuth"))
        .components(
            Components()
                .addSchemas(
                    ORGANISM_SCHEMA_NAME,
                    Schema<String>()
                        .type("string")
                        .description(
                            "Key of an organism configured in this $PROJECT_NAME instance. " +
                                "Use GET /api/config/organisms for the live list of valid values.",
                        ),
                )
                .addSecuritySchemes(
                    "bearerAuth",
                    SecurityScheme().name("bearerAuth").type(SecurityScheme.Type.HTTP).`in`(SecurityScheme.In.HEADER)
                        .scheme("bearer")
                        .bearerFormat("JWT"),
                ),
        )
}
