package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.service.licenses.License
import org.loculus.backend.service.licenses.LicensesDatabaseService
import org.loculus.backend.utils.Accession
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@SecurityRequirement(name = "bearerAuth")
class LicensesController(
    private val licensesDatabaseService: LicensesDatabaseService,
) {

    @Operation(description = "Set a new license. Until now, just testing purposes")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PutMapping("/licenses", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createNewGroup(
        @UsernameFromJwt username: String,
        @Parameter(
            description = "The accession of the dataset to set the license for",
        ) @RequestParam accession: Accession,
    ) = licensesDatabaseService.setNewLicense(
        accession,
        username,
        License(),
    )
}
