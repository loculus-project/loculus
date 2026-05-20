package org.loculus.backend.service.seqsetcitations

import org.loculus.backend.api.SeqSetCitingSource
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.ENABLE_SEQSETS_TRUE_VALUE
import org.loculus.backend.service.crossref.CrossRefService
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

private val log = mu.KotlinLogging.logger {}

internal fun mergeCitingSources(citingSources: List<SeqSetCitingSource>): Set<SeqSetCitingSource> {
    val mergedSources = mutableMapOf<String, SeqSetCitingSource>()

    for (citingSource in citingSources) {
        val existingSource = mergedSources[citingSource.sourceDOI]
        if (existingSource != null &&
            existingSource.copy(seqSetDOIs = emptySet()) != citingSource.copy(seqSetDOIs = emptySet())
        ) {
            log.warn {
                "Conflicting CrossRef metadata for citing source ${citingSource.sourceDOI} (keeping latest): $existingSource and $citingSource"
            }
        }
        mergedSources[citingSource.sourceDOI] = citingSource.copy(
            seqSetDOIs = existingSource?.seqSetDOIs.orEmpty() + citingSource.seqSetDOIs,
        )
    }
    return mergedSources.values.toSet()
}

@Component
@ConditionalOnProperty(BackendSpringProperty.ENABLE_SEQSETS, havingValue = ENABLE_SEQSETS_TRUE_VALUE)
class SeqSetCrossRefCitationsTask(
    private val crossRefService: CrossRefService,
    private val seqSetCitationsDatabaseService: SeqSetCitationsDatabaseService,
) {
    /**
     * Runs every six hours, with an initial delay of one minute.
     * Adds citing sources from CrossRef, and connects to SeqSets via their DOI.
     */
    @Scheduled(
        initialDelay = 1,
        fixedDelay = 360,
        timeUnit = java.util.concurrent.TimeUnit.MINUTES,
    )
    fun task() {
        log.info { "Updating SeqSet CrossRef citations..." }

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
        val citingSources = mergeCitingSources(crossRefService.getCrossRefCitedBy(doiPrefix))
        val seqSetDOIs = citingSources.flatMap { it.seqSetDOIs }.toSet()
        log.info {
            "Fetched ${citingSources.size} citing source(s) from CrossRef covering ${seqSetDOIs.size} SeqSet DOI(s)."
        }
        if (citingSources.isEmpty()) return

        val updateResult = seqSetCitationsDatabaseService.updateCitingSourcesFromCrossRef(citingSources)
        if (updateResult.updatedCitingSourceDOIs.isNotEmpty()) {
            log.info { "Updated ${updateResult.updatedCitingSourceDOIs.size} citing source(s)." }
        }
        val skippedCitingSources = citingSources.size - updateResult.updatedCitingSourceDOIs.size
        if (skippedCitingSources > 0) {
            log.warn { "Skipped $skippedCitingSources citing source(s) with no matching SeqSet." }
        }
    }
}
