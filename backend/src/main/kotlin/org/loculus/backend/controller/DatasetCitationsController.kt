package org.loculus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.api.Author
import org.loculus.backend.api.CitedBy
import org.loculus.backend.api.Dataset
import org.loculus.backend.api.DatasetRecord
import org.loculus.backend.api.ResponseAuthor
import org.loculus.backend.api.ResponseDataset
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.SubmittedAuthor
import org.loculus.backend.api.SubmittedAuthorUpdate
import org.loculus.backend.api.SubmittedDataset
import org.loculus.backend.api.SubmittedDatasetUpdate
import org.loculus.backend.service.datasetcitations.DatasetCitationsDatabaseService
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.springframework.http.MediaType
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
    private val groupManagementService: GroupManagementDatabaseService,
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val objectMapper: ObjectMapper,
) {
    @Operation(description = "Get a dataset")
    @GetMapping("/get-dataset", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getDataset(@RequestParam datasetId: String, @RequestParam version: Long?): List<Dataset> {
        return datasetCitationsService.getDataset(datasetId, version)
    }

    @Operation(description = "Create a new dataset with the specified data")
    @PostMapping("/create-dataset", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createDataset(@UsernameFromJwt username: String, @RequestBody body: SubmittedDataset): ResponseDataset {
        return datasetCitationsService.createDataset(username, body.name, body.records, body.description)
    }

    @Operation(description = "Update a dataset with the specified data")
    @PutMapping("/update-dataset", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun updateDataset(@UsernameFromJwt username: String, @RequestBody body: SubmittedDatasetUpdate): ResponseDataset {
        return datasetCitationsService.updateDataset(
            username,
            body.datasetId,
            body.name,
            body.records,
            body.description,
        )
    }

    @Operation(description = "Get a list of datasets created by a user")
    @GetMapping("/get-datasets-of-user", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getDatasets(@UsernameFromJwt username: String): List<Dataset> {
        return datasetCitationsService.getDatasets(username)
    }

    @Operation(description = "Get records for a dataset")
    @GetMapping("/get-dataset-records", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getDatasetRecords(@RequestParam datasetId: String, @RequestParam version: Long?): List<DatasetRecord> {
        return datasetCitationsService.getDatasetRecords(datasetId, version)
    }

    @Operation(description = "Delete a dataset")
    @DeleteMapping("/delete-dataset", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteDataset(
        @UsernameFromJwt username: String,
        @RequestParam datasetId: String,
        @RequestParam version: Long,
    ) {
        return datasetCitationsService.deleteDataset(username, datasetId, version)
    }

    @Operation(description = "Create a dataset DOI")
    @PostMapping("/create-dataset-doi", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createDatasetDOI(
        @UsernameFromJwt username: String,
        @RequestParam datasetId: String,
        @RequestParam version: Long,
    ): ResponseDataset {
        return datasetCitationsService.createDatasetDOI(username, datasetId, version)
    }

    @Operation(description = "Get count of user sequences cited by datasets")
    @GetMapping("/get-user-cited-by-dataset", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getUserCitedByDataset(@UsernameFromJwt username: String): CitedBy {
        val statusFilter = listOf(APPROVED_FOR_RELEASE)
        val userSequences = submissionDatabaseService.getSequences(username, null, null, statusFilter)
        return datasetCitationsService.getUserCitedByDataset(userSequences)
    }

    @Operation(description = "Get count of dataset cited by publications")
    @GetMapping("/get-dataset-cited-by-publication", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getDatasetCitedByPublication(@RequestParam datasetId: String, @RequestParam version: Long): CitedBy {
        return datasetCitationsService.getDatasetCitedByPublication(datasetId, version)
    }

    @Operation(description = "Get an author")
    @GetMapping("/get-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getAuthor(@UsernameFromJwt username: String): List<Author> {
        return datasetCitationsService.getAuthor(username)
    }

    @Operation(description = "Create a new author with the specified data")
    @PostMapping("/create-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createAuthor(@UsernameFromJwt username: String, @RequestBody body: SubmittedAuthor): ResponseAuthor {
        return datasetCitationsService.createAuthor(
            username,
            body.name,
            body.email,
            body.emailVerified,
            body.affiliation,
        )
    }

    @Operation(description = "Update an author with the specified data")
    @PutMapping("/update-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun updateAuthor(
        @UsernameFromJwt username: String,
        @RequestParam authorId: String,
        @RequestBody body: SubmittedAuthorUpdate,
    ): ResponseAuthor {
        return datasetCitationsService.updateAuthor(
            username,
            authorId,
            body.name,
            body.email,
            body.emailVerified,
            body.affiliation,
        )
    }

    @Operation(description = "Delete an author")
    @DeleteMapping("/delete-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteAuthor(@UsernameFromJwt username: String, @RequestParam authorId: String) {
        return datasetCitationsService.deleteAuthor(username, authorId)
    }
}
