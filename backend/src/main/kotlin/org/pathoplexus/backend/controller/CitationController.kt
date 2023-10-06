package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import io.swagger.v3.oas.annotations.Operation
import org.pathoplexus.backend.service.Author
import org.pathoplexus.backend.service.BibliographyRecord
import org.pathoplexus.backend.service.BibliographySet
import org.pathoplexus.backend.service.Citation
import org.pathoplexus.backend.service.DatabaseService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class CitationController(
    private val databaseService: DatabaseService,
    private val objectMapper: ObjectMapper,
) {

    @Operation(description = "Create a new author with the specified data")
    @PostMapping("/create-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun postCreateAuthor(
        @RequestParam affiliation: String,
        @RequestParam email: String,
        @RequestParam name: String
    ): Long {
        return databaseService.postCreateAuthor(affiliation, email, name)
    }
    @Operation(description = "Read an author's data")
    @GetMapping("/read-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getReadAuthor(
        @RequestParam authorId: Long,
    ): List<Author> {
        return databaseService.getReadAuthor(authorId)
    }
    @Operation(description = "Update an author with the specified data")
    @PatchMapping("/update-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun patchUpdateAuthor(
        @RequestParam authorId: Long,
        @RequestParam affiliation: String,
        @RequestParam email: String,
        @RequestParam name: String
    ) {
        return databaseService.patchUpdateAuthor(authorId, affiliation, email, name)
    }@Operation(description = "Delete an author")
    @DeleteMapping("/delete-author", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteAuthor(
        @RequestParam authorId: Long
    ) {
        return databaseService.deleteAuthor(authorId)
    }
    @Operation(description = "Retrieves a list of all the author ids registered")
    @GetMapping("/get-author-list", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getAuthorList(): List<Long> {
        return databaseService.getAuthorList()
    }

    @Operation(description = "Create a new bibliography record with the specified data")
    @PostMapping("/create-bibliography-record", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun postCreateBibliographyRecord(
        @RequestParam accession: String,
        @RequestParam license: String,
        @RequestParam name: String,
        @RequestParam type: String
        ): Long {
        return databaseService.postCreateBibliographyRecord(accession, license, name, type)
    }
    @Operation(description = "Read a bibliography record's data")
    @GetMapping("/read-bibliography-record", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getReadBibliographyRecord(
        @RequestParam bibliographyRecordId: Long,
    ): List<BibliographyRecord> {
        return databaseService.getReadBibliographyRecord(bibliographyRecordId)
    }
    @Operation(description = "Update a bibliography record with the specified data")
    @PatchMapping("/update-bibliography-record", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun patchUpdateBibliographyRecord(
        @RequestParam bibliographyRecordId: Long,
        @RequestParam accession: String,
        @RequestParam license: String,
        @RequestParam name: String,
        @RequestParam type: String
    ) {
        return databaseService.patchUpdateBibliographyRecord(bibliographyRecordId, accession, license, name, type)
    }@Operation(description = "Delete a bibliography record")
    @DeleteMapping("/delete-bibliography-record", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteBibliographyRecord(
        @RequestParam bibliographyRecordId: Long
    ) {
        return databaseService.deleteBibliographyRecord(bibliographyRecordId)
    }
    @Operation(description = "Retrieves a list of all the bibliography record ids registered")
    @GetMapping("/get-bibliography-record-list", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getBibliographyRecordList(): List<Long> {
        return databaseService.getBibliographyRecordList()
    }

    @Operation(description = "Create a new bibliography set with the specified data")
    @PostMapping("/create-bibliography-set", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun postCreateBibliographySet(
        @RequestParam version: Long,
        @RequestParam description: String,
        @RequestParam name: String,
        @RequestParam status: String,
        @RequestParam type: String
        ): Long {
        return databaseService.postCreateBibliographySet(version, description, name, status, type)
    }
    @Operation(description = "Read a bibliography set's data")
    @GetMapping("/read-bibliography-set", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getReadBibliographySet(
        @RequestParam bibliographySetId: Long,
    ): List<BibliographySet> {
        return databaseService.getReadBibliographySet(bibliographySetId)
    }
    @Operation(description = "Update a bibliography set with the specified data")
    @PatchMapping("/update-bibliography-set", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun patchUpdateBibliographySet(
        @RequestParam bibliographySetId: Long,
        @RequestParam version: Long,
        @RequestParam description: String,
        @RequestParam name: String,
        @RequestParam status: String,
        @RequestParam type: String
    ) {
        return databaseService.patchUpdateBibliographySet(bibliographySetId, version, description, name, status, type)
    }@Operation(description = "Delete a bibliography set")
    @DeleteMapping("/delete-bibliography-set", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteBibliographySet(
        @RequestParam bibliographySetId: Long
    ) {
        return databaseService.deleteBibliographySet(bibliographySetId)
    }
    @Operation(description = "Retrieves a list of all the bibliography set ids registered")
    @GetMapping("/get-bibliography-set-list", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getBibliographySetList(): List<Long> {
        return databaseService.getBibliographySetList()
    }

    @Operation(description = "Create a new citation with the specified data")
    @PostMapping("/create-citation", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun postCreateCitation(
        @RequestParam data: String,
        @RequestParam type: String
    ): Long {
        return databaseService.postCreateCitation(data, type)
    }
    @Operation(description = "Read a citation's data")
    @GetMapping("/read-citation", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getReadCitation(
        @RequestParam citationId: Long,
    ): List<Citation> {
        return databaseService.getReadCitation(citationId)
    }
    @Operation(description = "Update a citation with the specified data")
    @PatchMapping("/update-citation", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun patchUpdateCitation(
        @RequestParam citationId: Long,
        @RequestParam date: String,
        @RequestParam type: String
    ) {
        return databaseService.patchUpdateCitation(citationId, date, type)
    }@Operation(description = "Delete a citation")
    @DeleteMapping("/delete-citation", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteCitation(
        @RequestParam citationId: Long
    ) {
        return databaseService.deleteCitation(citationId)
    }
    @Operation(description = "Retrieves a list of all the citation ids registered")
    @GetMapping("/get-citation-list", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getCitationList(): List<Long> {
        return databaseService.getCitationList()
    }

}
