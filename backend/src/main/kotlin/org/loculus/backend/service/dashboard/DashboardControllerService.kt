package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.Query
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.selectAll
import org.loculus.backend.controller.PipelineVersionDashboard
import org.loculus.backend.controller.PipelineVersionStats
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(readOnly = true)
class PipelineVersionDashboardService(
    private val submissionDatabaseService: SubmissionDatabaseService
) {
    fun getPipelineVersionStats(): PipelineVersionDashboard {
        // Join sequence entries with preprocessed data to get version stats
        val query = SequenceEntriesPreprocessedDataTable
            .join(
                SequenceEntriesTable,
                JoinType.INNER,
                additionalConstraint = {
                    (SequenceEntriesPreprocessedDataTable.accessionColumn eq SequenceEntriesTable.accessionColumn) and
                    (SequenceEntriesPreprocessedDataTable.versionColumn eq SequenceEntriesTable.versionColumn)
                }
            )
            .selectAll()

        // Count sequences per pipeline version
        val versionCounts = query
            .groupBy { it[SequenceEntriesPreprocessedDataTable.pipelineVersionColumn] }
            .mapValues { it.value.size.toLong() }

        val currentVersion = submissionDatabaseService.getCurrentProcessingPipelineVersion()

        val stats = versionCounts.map { (version, count) ->
            PipelineVersionStats(
                pipelineVersion = version,
                sequenceCount = count,
                isCurrentVersion = version == currentVersion
            )
        }.sortedBy { it.pipelineVersion }

        val totalSequences = stats.sumOf { it.sequenceCount }

        return PipelineVersionDashboard(stats, totalSequences)
    }
}