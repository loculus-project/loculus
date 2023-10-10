package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import io.swagger.v3.oas.annotations.Operation
import org.pathoplexus.backend.service.Author
import org.pathoplexus.backend.service.Citation
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.service.Dataset
import org.pathoplexus.backend.service.DatasetRecord
import org.pathoplexus.backend.service.ResponseDataset
import org.pathoplexus.backend.service.SubmittedDataset
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class DatasetController(
    private val databaseService: DatabaseService,
    private val objectMapper: ObjectMapper,
) {
    @Operation(description = "Create a new dataset with the specified data")
    @PostMapping("/create-dataset", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createDataset(
        @RequestParam username: String,
        @RequestBody body: SubmittedDataset,
    ): ResponseDataset {
        return databaseService.createDataset(username, body.name, body.records, body.description)
    }

    @Operation(description = "Update a dataset with the specified data")
    @PutMapping("/update-dataset", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun updateDataset(
        @RequestParam username: String,
        @RequestParam datasetId: String,
        @RequestBody body: SubmittedDataset,
    ): ResponseDataset {
        return databaseService.updateDataset(username, datasetId, body.name, body.records, body.description)
    }

    @Operation(description = "Get a dataset")
    @GetMapping("/get-dataset", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getDataSet(
        @RequestParam datasetId: String,
        @RequestParam version: Long?,
    ): List<Dataset> {
        return databaseService.getDataSet(datasetId, version)
    }

    @Operation(description = "Get records for a dataset")
    @GetMapping("/get-dataset-records", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getDatasetRecords(
        @RequestParam datasetId: String,
        @RequestParam version: Long?,
    ): List<DatasetRecord> {
        return databaseService.getDatasetRecords(datasetId, version)
    }

    @Operation(description = "Get a list of datasets created by a user")
    @GetMapping("/get-datasets-of-user", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getDatasets(
        @RequestParam username: String,
    ): List<Dataset> {
        return databaseService.getDatasets(username)
    }

    @Operation(description = "Delete a dataset")
    @DeleteMapping("/delete-dataset", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteDataset(
        @RequestParam username: String,
        @RequestParam datasetId: String,
        @RequestParam version: Long,
    ) {
        return databaseService.deleteDataset(username, datasetId, version)
    }

    @Operation(description = "Create a new citation with the specified data")
    @PostMapping("/create-citation", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createCitation(
        @RequestParam data: String,
        @RequestParam type: String,
    ): Long {
        return databaseService.createCitation(data, type)
    }

    @Operation(description = "Get a citation")
    @GetMapping("/get-citation", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getCitation(
        @RequestParam citationId: Long,
    ): List<Citation> {
        return databaseService.getCitation(citationId)
    }

    @Operation(description = "Update a citation with the specified data")
    @PutMapping("/update-citation", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun updateCitation(
        @RequestParam citationId: Long,
        @RequestParam date: String,
        @RequestParam type: String,
    ) {
        return databaseService.updateCitation(citationId, date, type)
    }

    @Operation(description = "Delete a citation")
    @DeleteMapping("/delete-citation", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteCitation(
        @RequestParam citationId: Long,
    ) {
        return databaseService.deleteCitation(citationId)
    }

    @Operation(description = "Create a new author with the specified data")
    @PostMapping("/create-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createAuthor(
        @RequestParam affiliation: String,
        @RequestParam email: String,
        @RequestParam name: String,
    ): Long {
        return databaseService.createAuthor(affiliation, email, name)
    }

    @Operation(description = "Get an author")
    @GetMapping("/get-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getAuthor(
        @RequestParam authorId: Long,
    ): List<Author> {
        return databaseService.getAuthor(authorId)
    }

    @Operation(description = "Update an author with the specified data")
    @PutMapping("/update-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun updateAuthor(
        @RequestParam authorId: Long,
        @RequestParam affiliation: String,
        @RequestParam email: String,
        @RequestParam name: String,
    ) {
        return databaseService.updateAuthor(authorId, affiliation, email, name)
    }

    @Operation(description = "Delete an author")
    @DeleteMapping("/delete-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteAuthor(
        @RequestParam authorId: Long,
    ) {
        return databaseService.deleteAuthor(authorId)
    }
}
