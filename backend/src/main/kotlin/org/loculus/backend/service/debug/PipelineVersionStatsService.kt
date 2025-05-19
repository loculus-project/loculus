package org.loculus.backend.service.debug

import org.jetbrains.exposed.sql.Count
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNotNull
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.stringLiteral
import org.loculus.backend.api.Organism
import org.loculus.backend.service.submission.SequenceEntriesView
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class PipelineVersionStatsService {
    @Transactional(readOnly = true)
    fun getStats(): Map<String, Map<Long, Int>> {
        val countColumn = Count(stringLiteral("*"))
        val result = mutableMapOf<String, MutableMap<Long, Int>>()
        SequenceEntriesView
            .slice(
                SequenceEntriesView.organismColumn,
                SequenceEntriesView.pipelineVersionColumn,
                countColumn,
            )
            .select { SequenceEntriesView.pipelineVersionColumn.isNotNull() }
            .groupBy(SequenceEntriesView.organismColumn, SequenceEntriesView.pipelineVersionColumn)
            .forEach { row ->
                val organism = row[SequenceEntriesView.organismColumn]
                val version = row[SequenceEntriesView.pipelineVersionColumn]!!
                val count = row[countColumn].toInt()
                val perOrganism = result.getOrPut(organism) { mutableMapOf() }
                perOrganism[version] = count
            }
        return result
    }
}
