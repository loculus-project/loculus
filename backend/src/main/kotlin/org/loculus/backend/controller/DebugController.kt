package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.DEBUG_MODE_ON_VALUE
import org.loculus.backend.service.debug.DeleteSequenceDataService
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/debug")
@SecurityRequirement(name = "bearerAuth")
@ConditionalOnProperty(BackendSpringProperty.DEBUG_MODE, havingValue = DEBUG_MODE_ON_VALUE)
class DebugController(
    private val deleteSequenceDataService: DeleteSequenceDataService,
    private val submissionDatabaseService: SubmissionDatabaseService
) {

    @Operation(description = "An internal endpoint to delete all the sequence data for testing and debugging purposes.")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/delete-all-sequence-data")
    fun deleteAllSequenceData() {
        deleteSequenceDataService.deleteAllSequenceData()
    }

    @Operation(description = "Fetch the count of processed sequences by pipeline version.")
    @GetMapping("/processed-sequences-count")
    fun getProcessedSequencesCount(): Map<Long, Int> {
        return submissionDatabaseService.getProcessedSequencesCountByPipelineVersion()
    }
}
