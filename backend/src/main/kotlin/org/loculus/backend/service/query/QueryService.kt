package org.loculus.backend.service.query

import jakarta.validation.Valid
import jakarta.validation.Validator
import jakarta.validation.constraints.Min
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.errors.UnprocessableEntityException
import org.loculus.backend.types.Organism
import org.springframework.core.convert.converter.Converter
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

data class QueryParams(
    @field:Valid
    val organism: Organism,
    val q: QueryNode?,
    @field:Min(0)
    val limit: Int?,
    @field:Min(0)
    val offset: Int?,
    val sort: Sort?,
)

data class Sort(val field: String, val descending: Boolean)

@Component
class SortConverter : Converter<String, Sort> {
    override fun convert(source: String) = Sort(field = source.removePrefix("-"), descending = source.startsWith("-"))
}

@Service
class QueryService(
    private val validator: Validator,
    private val backendConfig: BackendConfig,
    private val queryConnector: QueryConnector,
) {
    fun metadata(params: QueryParams): ResponseEntity<StreamingResponseBody> {
        // Validate query parameters
        validateQueryParams(params)

        // Return results
        val response = queryConnector.metadata(params)
        return ResponseEntity(response.body, response.headers, HttpStatus.OK)
    }

    private fun validateQueryParams(params: QueryParams) {
        val errors = validator.validate(params)
        if (errors.isNotEmpty()) {
            throw UnprocessableEntityException(
                errors.map { "${it.propertyPath}: ${it.message}" }.sorted().joinToString("; "),
            )
        }

        // Check that sort field is known on the metadata schema
        val sort = params.sort ?: return
        val fields = backendConfig.getInstanceConfig(params.organism).schema.metadata.map { it.name }
        if (sort.field !in fields) {
            throw UnprocessableEntityException("sort: Invalid field: ${sort.field}, possible values are: $fields")
        }
    }
}
