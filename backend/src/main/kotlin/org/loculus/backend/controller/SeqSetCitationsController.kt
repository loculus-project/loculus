package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.api.AuthorProfile
import org.loculus.backend.api.CitedBy
import org.loculus.backend.api.Dataset
import org.loculus.backend.api.DatasetRecord
import org.loculus.backend.api.ResponseDataset
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.SubmittedDataset
import org.loculus.backend.api.SubmittedDatasetRecord
import org.loculus.backend.api.SubmittedDatasetUpdate
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.service.datasetcitations.DatasetCitationsDatabaseService
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@Validated
@SecurityRequirement(name = "bearerAuth")
class DatasetCitationsController(
    private val datasetCitationsService: DatasetCitationsDatabaseService,
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val keycloakAdapter: KeycloakAdapter,
) {
    @Operation(description = "Get a dataset")
    @GetMapping("/get-dataset")
    fun getDataset(@RequestParam datasetId: String, @RequestParam version: Long?): List<Dataset> {
        return datasetCitationsService.getDataset(datasetId, version)
    }

    @Operation(description = "Validate dataset records")
    @PostMapping("/validate-dataset-records")
    fun validateDatasetRecords(@RequestBody records: List<SubmittedDatasetRecord>) {
        return datasetCitationsService.validateDatasetRecords(records)
    }

    @Operation(description = "Create a new dataset with the specified data")
    @PostMapping("/create-dataset")
    fun createDataset(@UsernameFromJwt username: String, @RequestBody body: SubmittedDataset): ResponseDataset {
        return datasetCitationsService.createDataset(username, body.name, body.records, body.description)
    }

    @Operation(description = "Update a dataset with the specified data")
    @PutMapping("/update-dataset")
    fun updateDataset(@UsernameFromJwt username: String, @RequestBody body: SubmittedDatasetUpdate): ResponseDataset {
        return datasetCitationsService.updateDataset(
            username,
            body.datasetId,
            body.name,
            body.records,
            body.description,
        )
    }

    @Operation(description = "Get a list of datasets created by the logged-in user")
    @GetMapping("/get-datasets-of-user")
    fun getDatasets(@UsernameFromJwt username: String): List<Dataset> {
        return datasetCitationsService.getDatasets(username)
    }

    @Operation(description = "Get records for a dataset")
    @GetMapping("/get-dataset-records")
    fun getDatasetRecords(@RequestParam datasetId: String, @RequestParam version: Long?): List<DatasetRecord> {
        return datasetCitationsService.getDatasetRecords(datasetId, version)
    }

    @Operation(description = "Delete a dataset")
    @DeleteMapping("/delete-dataset")
    fun deleteDataset(
        @UsernameFromJwt username: String,
        @RequestParam datasetId: String,
        @RequestParam version: Long,
    ) {
        return datasetCitationsService.deleteDataset(username, datasetId, version)
    }

    @Operation(description = "Create and associate a DOI to a dataset version")
    @PostMapping("/create-dataset-doi")
    fun createDatasetDOI(
        @UsernameFromJwt username: String,
        @RequestParam datasetId: String,
        @RequestParam version: Long,
    ): ResponseDataset {
        return datasetCitationsService.createDatasetDOI(username, datasetId, version)
    }

    @Operation(description = "Get count of user sequences cited by datasets")
    @GetMapping("/get-user-cited-by-dataset")
    fun getUserCitedByDataset(@UsernameFromJwt username: String): CitedBy {
        val statusFilter = listOf(APPROVED_FOR_RELEASE)
        val userSequences = submissionDatabaseService.getSequences(username, null, null, statusFilter)
        return datasetCitationsService.getUserCitedByDataset(userSequences.sequenceEntries)
    }

    @Operation(description = "Get count of dataset cited by publications")
    @GetMapping("/get-dataset-cited-by-publication")
    fun getDatasetCitedByPublication(@RequestParam datasetId: String, @RequestParam version: Long): CitedBy {
        return datasetCitationsService.getDatasetCitedByPublication(datasetId, version)
    }

    @Operation(description = "Get an author")
    @GetMapping("/get-author")
    fun getAuthor(@RequestParam username: String): AuthorProfile {
        val keycloakUser = keycloakAdapter.getUsersWithName(username).firstOrNull()
        if (keycloakUser == null) {
            throw NotFoundException("Author profile $username does not exist")
        }
        return datasetCitationsService.transformKeycloakUserToAuthorProfile(keycloakUser)
    }
}
