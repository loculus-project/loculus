package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.service.submission.PipelineVersionDashboardService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

data class PipelineVersionStats(
    val pipelineVersion: Long,
    val sequenceCount: Long,
    val isCurrentVersion: Boolean
)

data class PipelineVersionDashboard(
    val stats: List<PipelineVersionStats>,
    val totalSequences: Long
)

@RestController
@SecurityRequirement(name = "bearerAuth")
class PipelineVersionDashboardController(
    private val pipelineVersionDashboardService: PipelineVersionDashboardService
) {
    @Operation(
        description = "Get statistics about how many sequences are processed with each pipeline version"
    )
    @GetMapping("/pipeline-version-dashboard")
    fun getPipelineVersionDashboard(): PipelineVersionDashboard =
        pipelineVersionDashboardService.getPipelineVersionStats()
}
