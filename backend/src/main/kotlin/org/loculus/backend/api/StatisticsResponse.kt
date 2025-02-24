package org.loculus.backend.api

/**
 * Response model for pipeline statistics endpoint.
 * Shows the count of sequences by organism and pipeline version.
 */
data class PipelineStatisticsResponse(
    // Map of organism name to statistics for that organism
    val statistics: Map<String, OrganismPipelineStatistics>,
)

/**
 * Statistics for a specific organism
 */
data class OrganismPipelineStatistics(
    // Total number of sequences for this organism
    val totalSequences: Int,
    // Count of sequences by pipeline version
    val sequencesByPipelineVersion: Map<Long, Int>,
)
