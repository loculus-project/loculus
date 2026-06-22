package org.loculus.backend.service.seqsetcitations

import org.loculus.backend.api.SeqSetCitationSource
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.ENABLE_SEQSETS_TRUE_VALUE
import org.loculus.backend.service.crossref.CrossRefService
import org.loculus.backend.service.scheduler.TaskLockService
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = mu.KotlinLogging.logger {}

const val SEQ_SET_CITATIONS_TASK_NAME = "seq-set-cross-ref-citations"

internal fun mergeCitationSources(citationSources: List<SeqSetCitationSource>): Set<SeqSetCitationSource> {
    val mergedSources = mutableMapOf<String, SeqSetCitationSource>()

    for (citationSource in citationSources) {
        val existingSource = mergedSources[citationSource.source.sourceDOI]
        if (existingSource != null &&
            existingSource.source != citationSource.source
        ) {
            log.warn {
                "Conflicting CrossRef metadata for citation source ${citationSource.source.sourceDOI} (keeping latest): $existingSource and $citationSource"
            }
        }
        mergedSources[citationSource.source.sourceDOI] = citationSource.copy(
            seqSetDOIs = existingSource?.seqSetDOIs.orEmpty() + citationSource.seqSetDOIs,
        )
    }
    return mergedSources.values.toSet()
}

@Component
@ConditionalOnProperty(BackendSpringProperty.ENABLE_SEQSETS, havingValue = ENABLE_SEQSETS_TRUE_VALUE)
class SeqSetCrossRefCitationsTask(
    private val crossRefService: CrossRefService,
    private val seqSetCitationsDatabaseService: SeqSetCitationsDatabaseService,
    private val taskLockService: TaskLockService,
    @Value("\${${BackendSpringProperty.SEQSET_CITATIONS_RUN_EVERY_MINUTES}}")
    private val runEveryMinutes: Long,
) {
    /**
     * Runs every six hours, with an initial delay of one minute.
     *
     * The task checks that the CrossRef service is active and a DOI prefix is configured for the Loculus instance.
     * If configured, it retrieves all CrossRef forward links (citations) which begin with the instance's DOI prefix.
     * These forward links are then merged into unique citation sources, each with a set of the SeqSet DOIs they cite.
     * The citation sources are then inserted or updated in the database, and connected to SeqSets through their DOIs.
     */
    @Scheduled(
        initialDelay = 1,
        fixedRateString = "\${${BackendSpringProperty.SEQSET_CITATIONS_RUN_EVERY_MINUTES}}",
        timeUnit = java.util.concurrent.TimeUnit.MINUTES,
    )
    fun task() {
        if (!taskLockService.acquireLock(
                SEQ_SET_CITATIONS_TASK_NAME,
                frequencyIntervalSeconds = TimeUnit.MINUTES.toSeconds(runEveryMinutes),
            )
        ) {
            return
        }
        log.info { "Updating SeqSet CrossRef citations..." }
        try {
            if (!crossRefService.isActive) {
                log.info { "CrossRef service is not active, skipping SeqSet citation update." }
                return
            }

            val doiPrefix = crossRefService.doiPrefix
            if (doiPrefix.isNullOrBlank()) {
                log.info { "CrossRef service has no DOI prefix, skipping SeqSet citation update." }
                return
            }

            log.info { "Fetching CrossRef citations for DOI prefix: $doiPrefix" }
            val citedByResult = crossRefService.getCrossRefCitedBy(doiPrefix)
            if (citedByResult.validationErrors.isNotEmpty()) {
                log.warn {
                    "Skipped ${citedByResult.validationErrors.size} CrossRef citation(s) due to validation errors."
                }
                citedByResult.validationErrors.forEach { error ->
                    log.warn {
                        "Validation error: ${error.reason}"
                    }
                }
            }
            val citationSources = mergeCitationSources(citedByResult.sources)
            val seqSetDOIs = citationSources.flatMap { it.seqSetDOIs }.toSet()
            log.info {
                "Fetched ${citationSources.size} citation source(s) from CrossRef covering ${seqSetDOIs.size} SeqSet DOI(s)."
            }
            if (citationSources.isEmpty()) return

            val updateResult = seqSetCitationsDatabaseService.updateCitationSourcesFromCrossRef(citationSources)
            if (updateResult.updatedCitationSourceDOIs.isNotEmpty()) {
                log.info { "Updated ${updateResult.updatedCitationSourceDOIs.size} citation source(s)." }
            }
            val skippedCitationSources = citationSources.size - updateResult.updatedCitationSourceDOIs.size
            if (skippedCitationSources > 0) {
                log.warn { "Skipped $skippedCitationSources citation source(s) with no matching SeqSet." }
            }
        } finally {
            taskLockService.releaseLock(
                SEQ_SET_CITATIONS_TASK_NAME,
                frequencyIntervalSeconds = TimeUnit.MINUTES.toSeconds(runEveryMinutes),
            )
        }
    }
}
