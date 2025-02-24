package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.api.PipelineStatisticsResponse
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/statistics")
class StatisticsController(
    private val submissionDatabaseService: SubmissionDatabaseService,
) {
    @Operation(
        description = "Get statistics on sequences processed by pipeline version for each organism",
    )
    @GetMapping("/pipeline-versions", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getPipelineStatistics(): PipelineStatisticsResponse {
        return PipelineStatisticsResponse(
            statistics = submissionDatabaseService.getPipelineStatistics()
        )
    }
}