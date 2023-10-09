package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import io.swagger.v3.oas.annotations.Operation
import org.pathoplexus.backend.service.Author
import org.pathoplexus.backend.service.BibliographyRecord
import org.pathoplexus.backend.service.BibliographySet
import org.pathoplexus.backend.service.SubmittedBibliographySet
import org.pathoplexus.backend.service.Citation
import org.pathoplexus.backend.service.DatabaseService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class CitationController(
    private val databaseService: DatabaseService,
    private val objectMapper: ObjectMapper,
) {
    @Operation(description = "Create a new bibliography set with the specified data")
    @PostMapping("/create-bibliography-set", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createBibliographySet(
        @RequestParam username: String,
        @RequestBody body: SubmittedBibliographySet,
    ): String {
        return databaseService.createBibliographySet(
            username, body.name, body.records, body.description)
    }

    @Operation(description = "Update a bibliography set with the specified data")
    @PatchMapping("/update-bibliography-set", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun updateBibliographySet(
        @RequestParam username: String,
        @RequestParam bibliographySetId: String,
        @RequestBody body: SubmittedBibliographySet,
    ) {
        return databaseService.updateBibliographySet(
            username, bibliographySetId, body.name, body.records, body.description)
    }

    @Operation(description = "Get a bibliography set")
    @GetMapping("/get-bibliography-set", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getBibliographySet(
        @RequestParam bibliographySetId: String,
        @RequestParam version: Long?,
    ): List<BibliographySet> {
        return databaseService.getBibliographySet(bibliographySetId, version)
    }

    @Operation(description = "Get records for a bibliography set")
    @GetMapping("/get-bibliography-set-records", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getBibliographyRecords(
        @RequestParam bibliographySetId: String,
        @RequestParam version: Long?,
    ): List<BibliographyRecord> {
        return databaseService.getBibliographyRecords(bibliographySetId, version)
    }

    @Operation(description = "Get a list of bibliography sets created by a user")
    @GetMapping("/get-bibliography-sets-of-user", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getBibliographySets(
        @RequestParam username: String,
    ): List<BibliographySet> {
        return databaseService.getBibliographySets(username)
    }

    @Operation(description = "Delete a bibliography set")
    @DeleteMapping("/delete-bibliography-set", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteBibliographySet(
        @RequestParam username: String,
        @RequestParam bibliographySetId: String,
    ) {
        return databaseService.deleteBibliographySet(username, bibliographySetId)
    }

    @Operation(description = "Create a new citation with the specified data")
    @PostMapping("/create-citation", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createCitation(
        @RequestParam data: String,
        @RequestParam type: String
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
    @PatchMapping("/update-citation", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun updateCitation(
        @RequestParam citationId: Long,
        @RequestParam date: String,
        @RequestParam type: String
    ) {
        return databaseService.updateCitation(citationId, date, type)
    }

    @Operation(description = "Delete a citation")
    @DeleteMapping("/delete-citation", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteCitation(
        @RequestParam citationId: Long
    ) {
        return databaseService.deleteCitation(citationId)
    }


    @Operation(description = "Create a new author with the specified data")
    @PostMapping("/create-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createAuthor(
        @RequestParam affiliation: String,
        @RequestParam email: String,
        @RequestParam name: String
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
    @PatchMapping("/update-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun updateAuthor(
        @RequestParam authorId: Long,
        @RequestParam affiliation: String,
        @RequestParam email: String,
        @RequestParam name: String
    ) {
        return databaseService.updateAuthor(authorId, affiliation, email, name)
    }

    @Operation(description = "Delete an author")
    @DeleteMapping("/delete-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteAuthor(
        @RequestParam authorId: Long
    ) {
        return databaseService.deleteAuthor(authorId)
    }
}
