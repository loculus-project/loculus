package org.loculus.backend.service.query

import jakarta.validation.Valid
import jakarta.validation.Validator
import jakarta.validation.constraints.Min
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.errors.UnprocessableEntityException
import org.loculus.backend.types.Organism
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

data class QueryParams(
    @field:Valid
    val organism: Organism,
    val q: String?,
    @field:Min(0)
    val limit: Int?,
    @field:Min(0)
    val offset: Int?,
    // Validation implemented in validateQueryParams
    val sort: String?,
)

@Service
class QueryService(private val validator: Validator, private val backendConfig: BackendConfig) {
    fun metadata(params: QueryParams): ResponseEntity<StreamingResponseBody> {
        // Validate query parameters
        validateQueryParams(params)

        // Parse q into AST

        // Transform into LAPIS-compatible query

        // Return results
        TODO("Call LAPIS and stream the response")
    }

    private fun validateQueryParams(params: QueryParams) {
        val errors = validator.validate(params)
        if (errors.isNotEmpty()) {
            throw UnprocessableEntityException(
                errors.map { "${it.propertyPath}: ${it.message}" }.sorted().joinToString("; "),
            )
        }

        val sort = params.sort ?: return
        val fields = backendConfig.getInstanceConfig(params.organism).schema.metadata.map { it.name }
        val sortField = sort.removePrefix("-")
        if (sortField !in fields) {
            throw UnprocessableEntityException("sort: Invalid field: $sortField, possible values are: $fields")
        }
    }
}
