package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.api.AuthorProfile
import org.loculus.backend.api.CitedBy
import org.loculus.backend.api.ResponseSeqSet
import org.loculus.backend.api.SeqSet
import org.loculus.backend.api.SeqSetRecord
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.SubmittedSeqSet
import org.loculus.backend.api.SubmittedSeqSetRecord
import org.loculus.backend.api.SubmittedSeqSetUpdate
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.service.seqsetcitations.SeqSetCitationsDatabaseService
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
class SeqSetCitationsController(
    private val seqSetCitationsService: SeqSetCitationsDatabaseService,
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val keycloakAdapter: KeycloakAdapter,
) {
    @Operation(description = "Get a SeqSet")
    @GetMapping("/get-seqset")
    fun getSeqSet(@RequestParam seqSetId: String, @RequestParam version: Long?): List<SeqSet> =
        seqSetCitationsService.getSeqSet(seqSetId, version)

    @Operation(description = "Validate SeqSet records")
    @PostMapping("/validate-seqset-records")
    fun validateSeqSetRecords(@RequestBody records: List<SubmittedSeqSetRecord>) =
        seqSetCitationsService.validateSeqSetRecords(records)

    @Operation(description = "Create a new SeqSet with the specified data")
    @PostMapping("/create-seqset")
    fun createSeqSet(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestBody body: SubmittedSeqSet,
    ): ResponseSeqSet =
        seqSetCitationsService.createSeqSet(authenticatedUser, body.name, body.records, body.description)

    @Operation(description = "Update a SeqSet with the specified data")
    @PutMapping("/update-seqset")
    fun updateSeqSet(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestBody body: SubmittedSeqSetUpdate,
    ): ResponseSeqSet = seqSetCitationsService.updateSeqSet(
        authenticatedUser,
        body.seqSetId,
        body.name,
        body.records,
        body.description,
    )

    @Operation(description = "Get a list of SeqSets created by the logged-in user")
    @GetMapping("/get-seqsets-of-user")
    fun getSeqSets(@HiddenParam authenticatedUser: AuthenticatedUser): List<SeqSet> =
        seqSetCitationsService.getSeqSets(authenticatedUser)

    @Operation(description = "Get records for a SeqSet")
    @GetMapping("/get-seqset-records")
    fun getSeqSetRecords(@RequestParam seqSetId: String, @RequestParam version: Long?): List<SeqSetRecord> =
        seqSetCitationsService.getSeqSetRecords(seqSetId, version)

    @Operation(description = "Delete a SeqSet")
    @DeleteMapping("/delete-seqset")
    fun deleteSeqSet(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestParam seqSetId: String,
        @RequestParam version: Long,
    ) = seqSetCitationsService.deleteSeqSet(authenticatedUser, seqSetId, version)

    @Operation(description = "Create and associate a DOI to a SeqSet version")
    @PostMapping("/create-seqset-doi")
    fun createSeqSetDOI(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestParam seqSetId: String,
        @RequestParam version: Long,
    ): ResponseSeqSet = seqSetCitationsService.createSeqSetDOI(authenticatedUser, seqSetId, version)

    @Operation(description = "Get count of user sequences cited by SeqSets")
    @GetMapping("/get-user-cited-by-seqset")
    fun getUserCitedBySeqSet(@HiddenParam authenticatedUser: AuthenticatedUser): CitedBy {
        val statusFilter = listOf(APPROVED_FOR_RELEASE)
        val userSequences = submissionDatabaseService.getSequences(authenticatedUser, null, null, statusFilter, null)
        return seqSetCitationsService.getUserCitedBySeqSet(userSequences.sequenceEntries)
    }

    @Operation(description = "Get count of SeqSet cited by publications")
    @GetMapping("/get-seqset-cited-by-publication")
    fun getSeqSetCitedByPublication(@RequestParam seqSetId: String, @RequestParam version: Long): CitedBy =
        seqSetCitationsService.getSeqSetCitedByPublication(seqSetId, version)

    @Operation(description = "Get an author")
    @GetMapping("/get-author")
    fun getAuthor(@RequestParam username: String): AuthorProfile {
        val keycloakUser = keycloakAdapter.getUsersWithName(username).firstOrNull()
            ?: throw NotFoundException("Author profile $username does not exist")

        return seqSetCitationsService.transformKeycloakUserToAuthorProfile(keycloakUser)
    }
}
