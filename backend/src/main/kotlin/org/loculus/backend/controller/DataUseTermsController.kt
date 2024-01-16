package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.service.datauseterms.DataUseTermsDatabaseService
import org.loculus.backend.utils.Accession
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@SecurityRequirement(name = "bearerAuth")
class DataUseTermsController(
    private val dataUseTermsDatabaseService: DataUseTermsDatabaseService,
) {

    @Operation(description = "Set new data use terms. Until now, just testing purposes")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PutMapping("/data-use-terms", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun setNewDataUseTerms(
        @UsernameFromJwt username: String,
        @Parameter(
            description = "The accession of the dataset to set the data use terms for",
        ) @RequestParam accession: Accession,
        @Parameter(
            description = "The new data use terms",
        ) @RequestBody newDataUseTerms: DataUseTerms,
    ) = dataUseTermsDatabaseService.setNewDataUseTerms(
        listOf(accession),
        username,
        DataUseTerms.Open(),
    )
}
