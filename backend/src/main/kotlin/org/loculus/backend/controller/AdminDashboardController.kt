package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/admin")
@SecurityRequirement(name = "bearerAuth")
class AdminDashboardController(private val submissionDatabaseService: SubmissionDatabaseService) {
    @Operation(summary = "Get number of processed sequence entries per pipeline version and organism")
    @GetMapping("/pipeline-statistics")
    fun getPipelineStatistics(): Map<String, Map<Long, Int>> = submissionDatabaseService.getPipelineVersionStatistics()
}
