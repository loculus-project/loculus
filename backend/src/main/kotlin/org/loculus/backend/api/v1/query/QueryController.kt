package org.loculus.backend.api.v1.query

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.auth.User
import org.loculus.backend.config.V1_API_VERSION
import org.loculus.backend.service.query.QueryParams
import org.loculus.backend.service.query.QueryService
import org.loculus.backend.types.Organism
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

@Tag(name = "Query", description = "Query sequence entries.")
@RestController
@RequestMapping("/$V1_API_VERSION")
@SecurityRequirement(name = "bearerAuth")
class QueryController(private val queryService: QueryService) {
    @Operation(
        summary = "Query metadata",
        description = "Query metadata of sequence entries.",
    )
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/query/metadata", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun metadata(
        @HiddenParam user: User,
        @RequestParam organism: Organism,
        @RequestParam(required = false) q: String?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) offset: Int?,
        @RequestParam(required = false) sort: String?,
    ): ResponseEntity<StreamingResponseBody> = queryService.metadata(QueryParams(organism, q, limit, offset, sort))
}
