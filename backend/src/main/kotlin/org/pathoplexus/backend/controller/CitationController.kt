package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import io.swagger.v3.oas.annotations.Operation
import org.pathoplexus.backend.service.Author
import org.pathoplexus.backend.service.Bibliography
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
    @Operation(description = "Get the total number of authors registered")
    @GetMapping("/get-author-count", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getAuthorCount(): Number {
        return databaseService.getAuthorCount()
    }

    @Operation(description = "Create a new bibliography with the specified data")
    @PostMapping("/create-bibliography", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun postCreateBibliography(
        @RequestParam data: String,
        @RequestParam name: String,
        @RequestParam type: String
        ): Long {
        return databaseService.postCreateBibliography(data, name, type)
    }
    @Operation(description = "Read a bibliographie's data")
    @GetMapping("/read-bibliography", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getReadBibliography(
        @RequestParam bibliographyId: Long,
    ): List<Bibliography> {
        return databaseService.getReadBibliography(bibliographyId)
    }
    @Operation(description = "Update a bibliography with the specified data")
    @PatchMapping("/update-bibliography", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun patchUpdateBibliography(
        @RequestParam bibliographyId: Long,
        @RequestParam data: String,
        @RequestParam name: String,
        @RequestParam type: String
    ) {
        return databaseService.patchUpdateBibliography(bibliographyId, data, name, type)
    }@Operation(description = "Delete a bibliography")
    @DeleteMapping("/delete-bibliography", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deleteBibliography(
        @RequestParam bibliographyId: Long
    ) {
        return databaseService.deleteBibliography(bibliographyId)
    }
    @Operation(description = "Get the total number of bibliographies registered")
    @GetMapping("/get-bibliography-count", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getBibliographyCount(): Number {
        return databaseService.getBibliographyCount()
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
    @Operation(description = "Get the total number of citations registered")
    @GetMapping("/get-citation-count", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getCitationCount(): Number {
        return databaseService.getCitationCount()
    }

}
