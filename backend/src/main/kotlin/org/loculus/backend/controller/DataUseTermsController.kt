package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.api.DataUseTermsChangeRequest
import org.loculus.backend.service.datauseterms.DataUseTermsDatabaseService
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@SecurityRequirement(name = "bearerAuth")
class DataUseTermsController(
    private val dataUseTermsDatabaseService: DataUseTermsDatabaseService,
) {

    @Operation(
        description = "Change the data use terms of the given accessions. Only a change to more open terms is allowed.",
    )
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PutMapping("/data-use-terms", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun setNewDataUseTerms(
        @UsernameFromJwt username: String,
        @Parameter @RequestBody request: DataUseTermsChangeRequest,
    ) = dataUseTermsDatabaseService.setNewDataUseTerms(
        username,
        request.accessions,
        request.newDataUseTerms,
    )
}
